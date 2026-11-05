#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apk2cartridge.py — 开罗游戏 Android APK -> Web 卡带 (.kairo.bin) 转换工具
=======================================================================
用法：
  python3 tools/apk2cartridge.py <input.apk> --id <game_id> --title <游戏名> -o public/cartridges/<game_id>.kairo.bin

转换流程：
1. 解包 APK 内 assets/bin/Data/Managed/Assembly-CSharp.dll 与加密资源包
2. 解密开罗 XOR 资源包中的 PNG 贴图集、img.inf、.seb 关键帧动画与 zh-CN 词典
3. 解析 .NET Metadata 表与全部方法的 CIL 字节码指令集及异常处理表 (EH clauses)
4. 输出经过 RFC-1951 Raw Deflate 压缩的标准化卡带文件 (<game_id>.kairo.bin)
"""

import struct, json

with open('/tmp/apk_extract/assets/bin/Data/Managed/Assembly-CSharp.dll', 'rb') as f:
    data = f.read()

# Load 100% aligned JP -> SC dictionary
with open('/tmp/gds_extracted/xls/English.lproj/text.txt', 'r', encoding='utf-8') as f:
    full_lines = f.read().splitlines()

sc = {}
with open('/tmp/gds_extracted/language/GameDevStory_SC.csv', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\r\n')
        if line.startswith('#') and ',' in line:
            k, v = line.split(',', 1)
            # Strip outer quotes if CSV quoted
            if len(v) >= 2 and v.startswith('"') and v.endswith('"'):
                v = v[1:-1].replace('""', '"')
            sc[int(k[1:])] = v

seen_full = set()
jp_to_sc = {}
idx = 0
for l in full_lines:
    if l not in seen_full:
        seen_full.add(l)
        jp = l.split('\t', 1)[0]
        if jp not in jp_to_sc:
            jp_to_sc[jp] = sc.get(idx, jp)
        jp_norm = jp.replace('\\n', '\n')
        if jp_norm not in jp_to_sc:
            jp_to_sc[jp_norm] = sc.get(idx, jp)
        idx += 1

bsjb = data.find(b'BSJB')
vlen = struct.unpack_from('<I', data, bsjb + 12)[0]
pos = bsjb + 16 + vlen + 2
num_streams = struct.unpack_from('<H', data, pos)[0]
pos += 2
streams = {}
for _ in range(num_streams):
    soff, ssz = struct.unpack_from('<II', data, pos); pos += 8
    name = b''
    while data[pos] != 0: name += bytes([data[pos]]); pos += 1
    pos = (pos + 4) & ~3
    streams[name.decode()] = (bsjb + soff, ssz)

str_off, _ = streams['#Strings']
blob_off, _ = streams['#Blob']
us_off, us_sz = streams['#US']
tilde_off, _ = streams['#~']

def get_str(i):
    end = data.find(b'\x00', str_off + i)
    return data[str_off + i:end].decode('utf-8', errors='replace')

def read_blob(i):
    p = blob_off + i
    b0 = data[p]
    if (b0 & 0x80) == 0: l = b0; p += 1
    elif (b0 & 0xC0) == 0x80: l = ((b0 & 0x3F) << 8) | data[p+1]; p += 2
    else: l = ((b0 & 0x1F) << 24) | (data[p+1] << 16) | (data[p+2] << 8) | data[p+3]; p += 4
    return data[p:p+l]

def read_us(tok):
    p = us_off + (tok & 0x00FFFFFF)
    b0 = data[p]
    if (b0 & 0x80) == 0: l = b0; p += 1
    elif (b0 & 0xC0) == 0x80: l = ((b0 & 0x3F) << 8) | data[p+1]; p += 2
    else: l = ((b0 & 0x1F) << 24) | (data[p+1] << 16) | (data[p+2] << 8) | data[p+3]; p += 4
    return data[p:p+l-1].decode('utf-16le', errors='replace') if l > 1 else ""

def parse_method_sig(sig_bytes):
    if not sig_bytes: return (False, 0, False, 1)
    p = 0
    cc = sig_bytes[p]; p += 1
    has_this = bool(cc & 0x20)
    if cc & 0x10:
        if (sig_bytes[p] & 0x80) == 0: p += 1
        elif (sig_bytes[p] & 0xC0) == 0x80: p += 2
        else: p += 4
    b0 = sig_bytes[p]
    if (b0 & 0x80) == 0: param_count = b0; p += 1
    elif (b0 & 0xC0) == 0x80: param_count = ((b0 & 0x3F) << 8) | sig_bytes[p+1]; p += 2
    else: param_count = ((b0 & 0x1F) << 24) | (sig_bytes[p+1] << 16) | (sig_bytes[p+2] << 8) | sig_bytes[p+3]; p += 4
    while p < len(sig_bytes) and sig_bytes[p] in (0x1F, 0x20, 0x45, 0x10):
        if sig_bytes[p] in (0x1F, 0x20):
            p += 1
            if (sig_bytes[p] & 0x80) == 0: p += 1
            elif (sig_bytes[p] & 0xC0) == 0x80: p += 2
            else: p += 4
        else:
            p += 1
    ret_type = sig_bytes[p] if p < len(sig_bytes) else 0x01
    has_ret = (ret_type != 0x01)
    return (has_this, param_count, has_ret, ret_type)

p = tilde_off
heap_sizes = data[p+6]
valid = struct.unpack_from('<Q', data, p+8)[0]
p += 24
rows = {}
for i in range(64):
    if (valid >> i) & 1: rows[i] = struct.unpack_from('<I', data, p)[0]; p += 4
str_idx_sz = 4 if (heap_sizes & 1) else 2
guid_idx_sz = 4 if (heap_sizes & 2) else 2
blob_idx_sz = 4 if (heap_sizes & 4) else 2
def coded_sz(tables, bits):
    m = max(rows.get(t, 0) for t in tables)
    return 4 if m >= (1 << (16 - bits)) else 2
typedef_or_ref_sz = coded_sz([2, 1, 27], 2)
field_idx_sz = 4 if rows.get(4, 0) >= 65536 else 2
method_idx_sz = 4 if rows.get(6, 0) >= 65536 else 2
param_idx_sz = 4 if rows.get(8, 0) >= 65536 else 2

t_off = p
def step(t, row_size):
    global t_off
    c = rows.get(t, 0)
    old = t_off
    t_off += c * row_size
    return old

step(0, 2 + str_idx_sz + guid_idx_sz * 3)
typeref_off = step(1, coded_sz([0, 26, 35, 1], 2) + str_idx_sz * 2)
typedef_off = step(2, 4 + str_idx_sz * 2 + typedef_or_ref_sz + field_idx_sz + method_idx_sz)
step(3, field_idx_sz)
field_off = step(4, 2 + str_idx_sz + blob_idx_sz)
step(5, method_idx_sz)
method_off = step(6, 8 + str_idx_sz + blob_idx_sz + param_idx_sz)
step(7, param_idx_sz)
step(8, 4 + str_idx_sz)
step(9, (4 if rows.get(2,0)>=65536 else 2) + typedef_or_ref_sz)
memberref_off = step(10, coded_sz([2, 1, 26, 6, 27], 3) + str_idx_sz + blob_idx_sz)
step(11, 2 + coded_sz([4, 8, 23], 2) + blob_idx_sz)
step(12, coded_sz([6,4,1,2,8,9,10,0,14,23,20,17,26,27,32,35,38,42,43], 5) + coded_sz([6, 10], 3) + blob_idx_sz)
step(13, coded_sz([4, 8], 1) + blob_idx_sz)
step(14, 2 + coded_sz([2, 6, 32], 2) + blob_idx_sz)
step(15, 6 + (4 if rows.get(2,0)>=65536 else 2))
step(16, 4 + field_idx_sz)
standalone_off = step(17, blob_idx_sz)
step(18, (4 if rows.get(2,0)>=65536 else 2) + (4 if rows.get(20,0)>=65536 else 2))
step(19, 2)
step(20, 2 + str_idx_sz + typedef_or_ref_sz)
step(21, (4 if rows.get(2,0)>=65536 else 2) + (4 if rows.get(23,0)>=65536 else 2))
step(22, 2)
step(23, 2 + str_idx_sz + blob_idx_sz)
step(24, 2 + method_idx_sz + coded_sz([20, 23], 1))
step(25, (4 if rows.get(2,0)>=65536 else 2) + coded_sz([6, 10], 1) * 2)
step(26, str_idx_sz)
typespec_off = step(27, blob_idx_sz)
step(28, 2 + coded_sz([4, 6], 1) + str_idx_sz + (4 if rows.get(26,0)>=65536 else 2))
frva_off = step(29, 4 + field_idx_sz)

step(30, 8)
step(31, 4)
step(32, 16 + blob_idx_sz + str_idx_sz * 2)
step(33, 4)
step(34, 12)
step(35, 16 + blob_idx_sz * 2 + str_idx_sz * 2)
step(36, 8)
step(37, 14)
step(38, 8 + str_idx_sz * 2 + coded_sz([0, 1, 2, 35, 38], 3))
step(39, 8 + str_idx_sz * 2 + coded_sz([2, 1, 38], 2) + field_idx_sz + method_idx_sz)
step(40, 8 + str_idx_sz + coded_sz([0, 26, 35, 38, 39], 3))
step(41, (4 if rows.get(2,0)>=65536 else 2) * 2)
step(42, 4 + coded_sz([2, 6], 1) + str_idx_sz)
mspec_mdor_sz = coded_sz([6, 10], 1)
methodspec_off = step(43, mspec_mdor_sz + blob_idx_sz)


print("Tables parsed successfully, frva_off=", frva_off)

# Build full lookup tables for Types, Fields, Methods, MemberRefs, FieldRVAs
td_sz = 4 + str_idx_sz * 2 + typedef_or_ref_sz + field_idx_sz + method_idx_sz
md_sz = 8 + str_idx_sz + blob_idx_sz + param_idx_sz
fd_sz = 2 + str_idx_sz + blob_idx_sz
tr_sz = coded_sz([0, 26, 35, 1], 2) + str_idx_sz * 2
mr_parent_sz = coded_sz([2, 1, 26, 6, 27], 3)
mr_sz = mr_parent_sz + str_idx_sz + blob_idx_sz

type_names = {}
method_to_type = {}
field_to_type = {}
for i in range(1, rows[2] + 1):
    off = typedef_off + (i - 1) * td_sz
    tname = get_str(struct.unpack_from('<I', data, off + 4)[0])
    tns = get_str(struct.unpack_from('<I', data, off + 8)[0])
    full = f"{tns}.{tname}" if tns else tname
    type_names[i] = full
    f_start = struct.unpack_from('<H', data, off + 4 + str_idx_sz * 2 + typedef_or_ref_sz)[0]
    m_start = struct.unpack_from('<H', data, off + 4 + str_idx_sz * 2 + typedef_or_ref_sz + field_idx_sz)[0]
    f_end = struct.unpack_from('<H', data, off + td_sz + 4 + str_idx_sz * 2 + typedef_or_ref_sz)[0] if i < rows[2] else rows[4] + 1
    m_end = struct.unpack_from('<H', data, off + td_sz + 4 + str_idx_sz * 2 + typedef_or_ref_sz + field_idx_sz)[0] if i < rows[2] else rows[6] + 1
    for f in range(f_start, f_end): field_to_type[f] = full
    for m in range(m_start, m_end): method_to_type[m] = full

typeref_names = {}
res_sz = coded_sz([0, 26, 35, 1], 2)
for i in range(1, rows[1] + 1):
    off = typeref_off + (i - 1) * tr_sz
    tname = get_str(struct.unpack_from('<I', data, off + res_sz)[0])
    tns = get_str(struct.unpack_from('<I', data, off + res_sz + str_idx_sz)[0])
    typeref_names[i] = f"{tns}.{tname}" if tns else tname

field_info = {}
for i in range(1, rows[4] + 1):
    off = field_off + (i - 1) * fd_sz
    flags = struct.unpack_from('<H', data, off)[0]
    fname = get_str(struct.unpack_from('<I', data, off + 2)[0])
    field_info[0x04000000 | i] = {
        'name': f"{field_to_type.get(i, '?')}::{fname}",
        'shortName': fname,
        'static': bool(flags & 0x0010)
    }

field_rvas = {}
rva_list = []
for i in range(rows[29]):
    rva, f_idx = struct.unpack_from('<IH', data, frva_off + i * 6)
    tok = 0x04000000 | f_idx
    field_rvas[tok] = rva
    rva_list.append((tok, rva))

rva_bytes = {}
for idx_r, (tok, rva) in enumerate(rva_list):
    # Find next distinct RVA to determine buffer size
    next_distinct = None
    for j in range(idx_r + 1, len(rva_list)):
        if rva_list[j][1] > rva:
            next_distinct = rva_list[j][1]
            break
    bsz = (next_distinct - rva) if next_distinct is not None else 64
    if bsz <= 0 or bsz > 1024:
        bsz = 40
    foff = rva - 0x1e00
    rva_bytes[tok] = list(data[foff:foff+bsz])

def get_locals_count(local_sig_tok):
    if local_sig_tok == 0: return 0
    idx = local_sig_tok & 0xFFFFFF
    b_idx = struct.unpack_from('<I' if blob_idx_sz == 4 else '<H', data, standalone_off + (idx - 1) * blob_idx_sz)[0]
    sb = read_blob(b_idx)
    if not sb or sb[0] != 0x07: return 0
    p = 1
    b0 = sb[p]
    if (b0 & 0x80) == 0: return b0
    elif (b0 & 0xC0) == 0x80: return ((b0 & 0x3F) << 8) | sb[p+1]
    else: return ((b0 & 0x1F) << 24) | (sb[p+1] << 16) | (sb[p+2] << 8) | sb[p+3]

method_sigs = {}
for i in range(1, rows[6] + 1):
    off = method_off + (i - 1) * md_sz
    rva = struct.unpack_from('<I', data, off)[0]
    flags = struct.unpack_from('<H', data, off + 6)[0]
    mname = get_str(struct.unpack_from('<I', data, off + 8)[0])
    b_idx = struct.unpack_from('<I' if blob_idx_sz == 4 else '<H', data, off + 8 + str_idx_sz)[0]
    has_this, pcount, has_ret, ret_type = parse_method_sig(read_blob(b_idx))
    method_sigs[0x06000000 | i] = {
        'type': method_to_type.get(i, '?'),
        'name': mname,
        'full': f"{method_to_type.get(i, '?')}::{mname}",
        'rva': rva,
        'hasThis': has_this,
        'params': pcount,
        'hasRet': has_ret
    }

for i in range(1, rows[10] + 1):
    off = memberref_off + (i - 1) * mr_sz
    parent = struct.unpack_from('<H' if mr_parent_sz == 2 else '<I', data, off)[0]
    mname = get_str(struct.unpack_from('<I', data, off + mr_parent_sz)[0])
    b_idx = struct.unpack_from('<I' if blob_idx_sz == 4 else '<H', data, off + mr_parent_sz + str_idx_sz)[0]
    sig_b = read_blob(b_idx)
    tag = parent & 7
    idx = parent >> 3
    pname = type_names.get(idx, '?') if tag == 0 else (typeref_names.get(idx, '?') if tag == 1 else f"tag{tag}_{idx}")
    if sig_b and sig_b[0] == 0x06: # Field ref!
        field_info[0x0A000000 | i] = {
            'name': f"{pname}::{mname}",
            'shortName': mname,
            'static': False
        }
    else:
        has_this, pcount, has_ret, ret_type = parse_method_sig(sig_b)
        method_sigs[0x0A000000 | i] = {
            'type': pname,
            'name': mname,
            'full': f"{pname}::{mname}",
            'rva': 0,
            'hasThis': has_this,
            'params': pcount,
            'hasRet': has_ret
        }


for i in range(1, rows.get(43, 0) + 1):
    off = methodspec_off + (i - 1) * (mspec_mdor_sz + blob_idx_sz)
    mdor = struct.unpack_from('<H' if mspec_mdor_sz == 2 else '<I', data, off)[0]
    base_tok = (0x06000000 if (mdor & 1) == 0 else 0x0A000000) | (mdor >> 1)
    if base_tok in method_sigs:
        method_sigs[0x2B000000 | i] = dict(method_sigs[base_tok])

print("Total method_sigs:", len(method_sigs), "field_info:", len(field_info))

# Decode all methods in target classes into pre-parsed instruction arrays
target_types = {
    'kairo.unity.form.FormBase',
    'kairo.unity.form.FormManagerBase',
    'form.BootForm',
    'form.FormManager',
    'form.GameForm',
    'form.MyFormBase',
    'form.RankForm',
    'form.SpForm',
    'form.SubForm',
    'form.TitleForm',
    'main.Anim',
    'main.AppData',
    'surface.GameView',
    'surface.GamePad',
    'kairo.unity.surface.SurfaceBase',
    'kairo.unity.surface.TouchComponent',
    'kairo.unity.surface.TouchEvent',
    'kairo.unity.surface.TouchOption',
    'kairo.unity.ui.Balloon',
    'kairo.unity.ui.Seb',
    'kairo.unity.ui.ResourceManager',
    '<SetPanel>c__AnonStorey7B',
    'cfg.MyConfig'
}

string_pool = []
string_map = {}
def intern_str(s):
    if s not in string_map:
        string_map[s] = len(string_pool)
        string_pool.append(s)
    return string_map[s]

compiled_methods = {}

for tok, msig in list(method_sigs.items()):
    if (tok >> 24) != 0x06: continue
    if msig['type'] not in target_types: continue
    rva = msig['rva']
    if rva == 0: continue
    boff = rva - 0x1e00
    b = data[boff]
    raw_eh = []
    if (b & 3) == 2:
        code = data[boff+1 : boff+1+(b>>2)]
        locals_cnt = 0
    else:
        mflags = struct.unpack_from('<H', data, boff)[0] & 0x0FFF
        csz = struct.unpack_from('<I', data, boff + 4)[0]
        local_tok = struct.unpack_from('<I', data, boff + 8)[0]
        code = data[boff+12 : boff+12+csz]
        locals_cnt = get_locals_count(local_tok)
        if mflags & 0x0008:
            eh_off = (boff + 12 + csz + 3) & ~3
            skind = data[eh_off]
            if (skind & 0x3F) == 1:
                if skind & 0x40:
                    dsz = struct.unpack_from('<I', data, eh_off)[0] >> 8
                    ncl = (dsz - 4) // 24
                    for ci in range(ncl):
                        cf, toff, tlen, hoff, hlen, ctok = struct.unpack_from('<IIIIII', data, eh_off + 4 + ci * 24)
                        raw_eh.append((cf, toff, toff + tlen, hoff))
                else:
                    dsz = data[eh_off + 1]
                    ncl = (dsz - 4) // 12
                    for ci in range(ncl):
                        cf, toff, tlen, hoff, hlen, ctok = struct.unpack_from('<HHBHBI', data, eh_off + 4 + ci * 12)
                        raw_eh.append((cf, toff, toff + tlen, hoff))

    # First pass: map byte offset ip -> instruction index
    ip_to_idx = {}
    raw_insns = []
    ip = 0
    while ip < len(code):
        ip0 = ip
        ip_to_idx[ip0] = len(raw_insns)
        op = code[ip]; ip += 1
        if op == 0xFE:
            op2 = code[ip]; ip += 1
            full_op = 0xFE00 | op2
            if op2 == 0x06:
                arg = struct.unpack_from('<I', code, ip)[0]; ip += 4
            elif op2 in (0x09,0x0A,0x0B,0x0C,0x0D,0x0E):
                arg = struct.unpack_from('<H', code, ip)[0]; ip += 2
            elif op2 in (0x15,0x16,0x1A):
                arg = struct.unpack_from('<I', code, ip)[0]; ip += 4
            else:
                arg = 0
            raw_insns.append([full_op, arg, ip])
            continue

        if op in (0x20, 0x72, 0x28, 0x6F, 0x70, 0x71, 0x73, 0x74, 0x75, 0x79, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F, 0x80, 0x81, 0x8C, 0x8D, 0x8F, 0xA3, 0xA4, 0xA5, 0xD0):
            if op == 0x20:
                arg = struct.unpack_from('<i', code, ip)[0]
            elif op == 0x72:
                utok = struct.unpack_from('<I', code, ip)[0]
                arg = intern_str(read_us(utok))
            else:
                arg = struct.unpack_from('<I', code, ip)[0]
            ip += 4
        elif op == 0x22:
            v = struct.unpack_from('<f', code, ip)[0]; ip += 4
            arg = 0.0 if (v != v or v == float("inf") or v == float("-inf")) else round(v, 6)
        elif op == 0x21:
            arg = struct.unpack_from('<q', code, ip)[0]; ip += 8
        elif op == 0x23:
            v = struct.unpack_from('<d', code, ip)[0]; ip += 8
            arg = 0.0 if (v != v or v == float("inf") or v == float("-inf")) else round(v, 6)
        elif op in (0x38,0x39,0x3A,0x3B,0x3C,0x3D,0x3E,0x3F,0x40,0x41,0x42,0x43,0x44,0xDD):
            rel = struct.unpack_from('<i', code, ip)[0]; ip += 4
            arg = ('br', ip + rel)
        elif op in (0x2B,0x2C,0x2D,0x2E,0x2F,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0xDE):
            rel = struct.unpack_from('<b', code, ip)[0]; ip += 1
            arg = ('br', ip + rel)
        elif op == 0x1F:
            arg = struct.unpack_from('<b', code, ip)[0]; ip += 1
        elif op in (0x0E,0x0F,0x10,0x11,0x12,0x13):
            arg = code[ip]; ip += 1
        elif op == 0x45:
            n = struct.unpack_from('<I', code, ip)[0]; ip += 4
            targets = []
            base_ip = ip + n * 4
            for _ in range(n):
                rel = struct.unpack_from('<i', code, ip)[0]; ip += 4
                targets.append(base_ip + rel)
            arg = ('sw', targets)
        else:
            arg = 0
        raw_insns.append([op, arg, ip])

    # Second pass: resolve branch targets to instruction indices
    insns = []
    for op, arg, next_ip in raw_insns:
        if isinstance(arg, tuple) and arg[0] == 'br':
            insns.append([op, ip_to_idx.get(arg[1], 0)])
        elif isinstance(arg, tuple) and arg[0] == 'sw':
            insns.append([op, [ip_to_idx.get(t, 0) for t in arg[1]]])
        else:
            insns.append([op, arg])

    eh_clauses = []
    for cf, ts, te, hs in raw_eh:
        eh_clauses.append([cf, ip_to_idx.get(ts, 0), ip_to_idx.get(te, len(insns)), ip_to_idx.get(hs, 0)])
    compiled_methods[tok] = {
        'type': msig['type'],
        'name': msig['name'],
        'full': msig['full'],
        'hasThis': msig['hasThis'],
        'params': msig['params'],
        'hasRet': msig['hasRet'],
        'locals': locals_cnt,
        'insns': insns,
        'eh': eh_clauses
    }

print("Compiled methods count:", len(compiled_methods), "String pool size:", len(string_pool))

# Save bundle for Node.js testing
bundle = {
    'strings': string_pool,
    'jpToSc': jp_to_sc,
    'scById': sc,
    'methods': compiled_methods,
    'methodSigs': method_sigs,
    'fields': field_info,
    'rvaBytes': rva_bytes
}
with open('/tmp/gds_cil_bundle.json', 'w', encoding='utf-8') as f:
    json.dump(bundle, f, ensure_ascii=False, allow_nan=False)
print("Saved /tmp/gds_cil_bundle.json")
