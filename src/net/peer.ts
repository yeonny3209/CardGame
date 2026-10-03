// WebRTC transport: a single reliable, ordered data channel between two browsers or app instances.
// Connection codes are exchanged by hand (see signal.ts), so no server is needed. A public STUN server is only
// used to find a route through home routers; on the same network the duel works without it.
import type { Channel } from './channel';
import { decodeSignal, encodeSignal } from './signal';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const GATHER_TIMEOUT_MS = 6000;

export function onlineSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

export class PeerLink implements Channel {
  onMessage: ((data: string) => void) | null = null;
  onClose: (() => void) | null = null;
  /** Resolves when the data channel is open, rejects when the connection fails first. */
  readonly opened: Promise<void>;
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private resolveOpen!: () => void;
  private rejectOpen!: (e: Error) => void;
  private isOpen = false;
  private closed = false;

  constructor(useStun = true) {
    this.opened = new Promise<void>((res, rej) => {
      this.resolveOpen = res;
      this.rejectOpen = rej;
    });
    this.opened.catch(() => {}); // the UI handles failures through its own await
    this.pc = new RTCPeerConnection({ iceServers: useStun ? STUN : [] });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed' || (s === 'disconnected' && !this.isOpen)) this.fail('연결에 실패했습니다.');
    };
    this.pc.ondatachannel = (e) => this.attach(e.channel);
  }

  private attach(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      this.isOpen = true;
      this.resolveOpen();
    };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') this.onMessage?.(e.data);
    };
    dc.onclose = () => this.fail('연결이 끊어졌습니다.');
    if (dc.readyState === 'open') dc.onopen(new Event('open'));
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.isOpen) this.rejectOpen(new Error(reason));
    this.onClose?.();
    try {
      this.pc.close();
    } catch {
      // already closed
    }
  }

  private async gathered(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, GATHER_TIMEOUT_MS);
    });
  }

  private async localCode(): Promise<string> {
    await this.gathered();
    const d = this.pc.localDescription!;
    return encodeSignal({ type: d.type as 'offer' | 'answer', sdp: d.sdp });
  }

  /** Host, step 1: returns the code to give to the guest. */
  async createOffer(): Promise<string> {
    this.attach(this.pc.createDataChannel('duel', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return this.localCode();
  }

  /** Guest, step 1: takes the host's code and returns the code to give back. */
  async acceptOffer(code: string): Promise<string> {
    const desc = await decodeSignal(code);
    if (!desc || desc.type !== 'offer') throw new Error('올바른 호스트 코드가 아닙니다.');
    await this.pc.setRemoteDescription(desc);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return this.localCode();
  }

  /** Host, step 2: takes the guest's code. */
  async acceptAnswer(code: string): Promise<void> {
    const desc = await decodeSignal(code);
    if (!desc || desc.type !== 'answer') throw new Error('올바른 게스트 코드가 아닙니다.');
    await this.pc.setRemoteDescription(desc);
  }

  send(data: string): void {
    if (this.dc?.readyState === 'open') this.dc.send(data);
  }

  close(): void {
    this.fail('연결을 닫았습니다.');
  }
}
