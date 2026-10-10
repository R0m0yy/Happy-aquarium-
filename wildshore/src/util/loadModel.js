// Loads our self-contained .gltf.json models without letting GLTFLoader fetch data: URIs
// (sandboxed viewers block fetch of data:/blob: URLs). The embedded buffer is decoded here
// and handed to the loader as an in-memory GLB; textures stay data: images (loaded via <img>).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function loadModel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
  const json = await res.json();
  const buf = json.buffers?.[0];
  let bin = new Uint8Array(0);
  if (buf && buf.uri && buf.uri.startsWith('data:')) {
    bin = b64ToBytes(buf.uri.slice(buf.uri.indexOf(',') + 1));
    delete buf.uri;
    buf.byteLength = bin.length;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = (jsonBytes.length + 3) & ~3;
  const binLen = (bin.length + 3) & ~3;
  const total = 12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0);
  const glb = new Uint8Array(total);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLen); glb.set(jsonBytes, 20);
  if (bin.length) {
    const o = 20 + jsonLen;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    glb.set(bin, o + 8);
  }
  return new GLTFLoader().parseAsync(glb.buffer, '');
}
