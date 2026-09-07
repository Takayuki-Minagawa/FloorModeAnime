/** Legacy input intentionally coerces numeric strings, unlike strict archives. */
export function parseLegacyData(data) {
  // --- 3. meta --------------------------------------------------------------
  const meta = data.meta ?? {};

  // --- 4. nodes → Map<id, {id, x, y, z}> -----------------------------------
  const nodes = new Map();
  const nodeIdCounts = new Map();
  if (Array.isArray(data.nodes)) {
    for (const n of data.nodes) {
      const id = Number(n.id);
      const x = Number(n.x ?? 0);
      const y = Number(n.y ?? 0);
      const z = Number(n.z ?? 0);
      nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);
      nodes.set(id, { id, x, y, z });
    }
  }

  // --- 5. lines → Array<{id, nodeI, nodeJ}> ---------------------------------
  const lines = [];
  if (Array.isArray(data.lines)) {
    for (const l of data.lines) {
      lines.push({
        id: Number(l.id),
        nodeI: Number(l.nodeI),
        nodeJ: Number(l.nodeJ),
      });
    }
  }

  // --- 6. freqHz → Map<modeNum, freq> ---------------------------------------
  const freqHz = new Map();
  if (data.freqHz && typeof data.freqHz === 'object') {
    for (const [key, val] of Object.entries(data.freqHz)) {
      const modeNum = Number(key);
      const freq = Number(val);
      freqHz.set(modeNum, freq);
    }
  }

  // --- 7. modes → Map<modeNum, Map<nodeId, uz>> -----------------------------
  //    未記載の節点は uz = 0.0 とみなす（ここでは全 nodes を埋める）
  const modes = new Map();
  if (data.modes && typeof data.modes === 'object') {
    for (const [modeKey, modeVal] of Object.entries(data.modes)) {
      const modeNum = Number(modeKey);
      const uzMap = new Map();

      // まずすべての節点を uz = 0.0 で初期化
      for (const nodeId of nodes.keys()) {
        uzMap.set(nodeId, 0.0);
      }

      // JSON に記載された値で上書き
      if (modeVal && typeof modeVal === 'object') {
        for (const [nodeKey, uzVal] of Object.entries(modeVal)) {
          const nodeId = Number(nodeKey);
          const uz = Number(uzVal);
          uzMap.set(nodeId, uz);
        }
      }

      modes.set(modeNum, uzMap);
    }
  }

  // --- 8. phase0 → Map<modeNum, radians>（任意。未指定モードは 0 とみなす） ----
  //    CLAUDE.md の式 sin(2π f t + φ0) の φ0。後方互換のため省略可能。
  const phase0 = new Map();
  if (data.phase0 && typeof data.phase0 === 'object') {
    for (const [key, val] of Object.entries(data.phase0)) {
      phase0.set(Number(key), Number(val));
    }
  }

  return {
    dataKind: 'mode',
    meta,
    nodes,
    nodeIdCounts,
    lines,
    freqHz,
    modes,
    phase0,
  };
}
