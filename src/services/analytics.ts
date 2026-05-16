/**
 * Options Greeks and GEX Analytics Engine
 * Ported from Technical Specification May 2026
 */

export const RISK_FREE = 0.065;
export const DEFAULT_IV = 0.15;

export interface OptionData {
  strike: number;
  type: 'CE' | 'PE';
  ltp: number;
  oi: number;
  iv: number;
  delta: number;
  gamma: number;
}

export function computeGex(df: OptionData[], spot: number, dte: number, lotSize: number) {
  // GEX multiplier: spot² × lot_size × 0.0001 / 1e7
  const multiplier = (Math.pow(spot, 2) * lotSize * 0.0001) / 10000000;
  
  return df.map(opt => {
    const isCall = opt.type === 'CE';
    const gex = opt.gamma * opt.oi * (isCall ? 1 : -1) * multiplier;
    return {
      ...opt,
      gex
    };
  });
}

export function findGammaFlip(df: any[], spot: number) {
  // Simple heuristic or linear search for sign flip in net GEX
  let prevGex = 0;
  let prevStrike = 0;
  
  // Sort by strike
  const sorted = [...df].sort((a, b) => a.strike - b.strike);
  
  for (const row of sorted) {
    if (prevGex !== 0 && Math.sign(row.netGex) !== Math.sign(prevGex)) {
      // Linear interpolation
      return prevStrike + (row.strike - prevStrike) * (Math.abs(prevGex) / (Math.abs(prevGex) + Math.abs(row.netGex)));
    }
    prevGex = row.netGex;
    prevStrike = row.strike;
  }
  return spot;
}

export function computeWallsAndRegime(df: any[]) {
  const sorted = [...df].sort((a, b) => a.strike - b.strike);
  let totalNetGex = 0;
  let callWall = 0;
  let putWall = 0;
  let maxCallOi = 0;
  let maxPutOi = 0;

  df.forEach(row => {
    totalNetGex += row.netGex;
    if (row.callOi > maxCallOi) {
      maxCallOi = row.callOi;
      callWall = row.strike;
    }
    if (row.putOi > maxPutOi) {
      maxPutOi = row.putOi;
      putWall = row.strike;
    }
  });

  const regime = totalNetGex > 0 ? "Stabilizing" : "Volatile";
  return { callWall, putWall, regime };
}

export function computePcrAndMaxPain(df: any[]) {
  let totalCallOi = 0;
  let totalPutOi = 0;
  let maxPainStrike = 0;
  let minTotalPain = Infinity;

  df.forEach(row => {
    totalCallOi += row.Call_OI || 0;
    totalPutOi += row.Put_OI || 0;
  });

  const pcr = totalCallOi > 0 ? totalPutOi / totalCallOi : 0;

  // Max Pain calculation
  df.forEach(target => {
    let currentPain = 0;
    df.forEach(row => {
      const callPain = Math.max(0, target.Strike - row.Strike) * (row.Call_OI || 0);
      const putPain = Math.max(0, row.Strike - target.Strike) * (row.Put_OI || 0);
      currentPain += callPain + putPain;
    });
    if (currentPain < minTotalPain) {
      minTotalPain = currentPain;
      maxPainStrike = target.Strike;
    }
  });

  return { pcr, maxPain: maxPainStrike };
}
