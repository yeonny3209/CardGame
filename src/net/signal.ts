// Connection codes: a WebRTC session description packed into a short string that two players can copy and paste.
// There is no signaling server, so nothing here needs the network.
export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

const PREFIX = 'AD1.';
const PREFIX_RAW = 'AD0.';

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeSignal(desc: SessionDescription): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
  if (canCompress()) return PREFIX + toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
  return PREFIX_RAW + toB64Url(json);
}

/** Returns null when the text is not a valid connection code. */
export async function decodeSignal(code: string): Promise<SessionDescription | null> {
  const text = code.replace(/\s+/g, '');
  try {
    let json: Uint8Array;
    if (text.startsWith(PREFIX)) {
      if (!canCompress()) return null;
      json = await pipe(fromB64Url(text.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    } else if (text.startsWith(PREFIX_RAW)) json = fromB64Url(text.slice(PREFIX_RAW.length));
    else return null;
    const o = JSON.parse(new TextDecoder().decode(json));
    if ((o.t !== 'offer' && o.t !== 'answer') || typeof o.s !== 'string') return null;
    return { type: o.t, sdp: o.s };
  } catch {
    return null;
  }
}
