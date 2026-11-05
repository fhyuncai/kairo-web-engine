/**
 * Pure TypeScript synchronous RFC-1951 raw deflate decompressor
 * Used to unpack .kairo.bin cartridge binaries in browser memory
 */
export function inflateRaw(src: Uint8Array): Uint8Array {
  let pos = 0, bitBuf = 0, bitCnt = 0;
  function bits(n: number): number {
    while (bitCnt < n) {
      bitBuf |= (src[pos++] || 0) << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  }
  function buildTree(lengths: Uint8Array) {
    const counts = new Int32Array(16), nextCode = new Int32Array(16);
    let maxLen = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] > 0) {
        counts[lengths[i]]++;
        if (lengths[i] > maxLen) maxLen = lengths[i];
      }
    }
    let code = 0;
    for (let b = 1; b <= 15; b++) {
      code = (code + counts[b - 1]) << 1;
      nextCode[b] = code;
    }
    const map = new Int32Array(1 << (maxLen || 1)).fill(-1);
    for (let sym = 0; sym < lengths.length; sym++) {
      const len = lengths[sym];
      if (!len) continue;
      let c = nextCode[len]++, rev = 0;
      for (let i = 0; i < len; i++) {
        rev = (rev << 1) | (c & 1);
        c >>>= 1;
      }
      const step = 1 << len, val = (len << 16) | sym;
      for (let idx = rev; idx < map.length; idx += step) map[idx] = val;
    }
    return { map, maxLen: maxLen || 1 };
  }
  function decode(tree: { map: Int32Array; maxLen: number }): number {
    while (bitCnt < tree.maxLen) {
      bitBuf |= (src[pos++] || 0) << bitCnt;
      bitCnt += 8;
    }
    const entry = tree.map[bitBuf & ((1 << tree.maxLen) - 1)];
    const len = entry >>> 16;
    bitBuf >>>= len;
    bitCnt -= len;
    return entry & 0xffff;
  }

  const fixedLitLens = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) fixedLitLens[i] = 8;
  for (let i = 144; i <= 255; i++) fixedLitLens[i] = 9;
  for (let i = 256; i <= 279; i++) fixedLitLens[i] = 7;
  for (let i = 280; i <= 287; i++) fixedLitLens[i] = 8;
  const fixedDistLens = new Uint8Array(32).fill(5);
  const fixedLitTree = buildTree(fixedLitLens);
  const fixedDistTree = buildTree(fixedDistLens);

  const lenBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  let out = new Uint8Array(src.length * 4), outPos = 0;
  function ensure(n: number) {
    if (outPos + n > out.length) {
      const next = new Uint8Array(Math.max(out.length * 2, outPos + n));
      next.set(out);
      out = next;
    }
  }
  let bfinal = 0;
  while (!bfinal) {
    bfinal = bits(1);
    const btype = bits(2);
    if (btype === 0) {
      bitBuf = 0;
      bitCnt = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      ensure(len);
      out.set(src.subarray(pos, pos + len), outPos);
      pos += len;
      outPos += len;
    } else {
      let litTree = fixedLitTree, distTree = fixedDistTree;
      if (btype === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const clLens = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLens[clOrder[i]] = bits(3);
        const clTree = buildTree(clLens);
        const allLens = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < allLens.length) {
          const s = decode(clTree);
          if (s < 16) allLens[idx++] = s;
          else if (s === 16) {
            let r = bits(2) + 3, prev = allLens[idx - 1];
            while (r-- > 0) allLens[idx++] = prev;
          } else if (s === 17) {
            let r = bits(3) + 3;
            while (r-- > 0) allLens[idx++] = 0;
          } else {
            let r = bits(7) + 11;
            while (r-- > 0) allLens[idx++] = 0;
          }
        }
        litTree = buildTree(allLens.subarray(0, hlit));
        distTree = buildTree(allLens.subarray(hlit));
      }
      while (true) {
        const sym = decode(litTree);
        if (sym === 256) break;
        if (sym < 256) {
          ensure(1);
          out[outPos++] = sym;
        } else {
          const li = sym - 257;
          const length = lenBase[li] + (lenExtra[li] ? bits(lenExtra[li]) : 0);
          const di = decode(distTree);
          const dist = distBase[di] + (distExtra[di] ? bits(distExtra[di]) : 0);
          ensure(length);
          let srcIdx = outPos - dist;
          for (let i = 0; i < length; i++) out[outPos++] = out[srcIdx++];
        }
      }
    }
  }
  return out.subarray(0, outPos);
}
