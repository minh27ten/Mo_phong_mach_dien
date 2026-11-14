export class Complex {
  constructor(
    public readonly re: number,
    public readonly im: number = 0,
  ) {}

  static zero(): Complex {
    return new Complex(0, 0);
  }

  static one(): Complex {
    return new Complex(1, 0);
  }

  static fromPolar(mag: number, deg: number): Complex {
    const rad = (deg * Math.PI) / 180;
    return new Complex(mag * Math.cos(rad), mag * Math.sin(rad));
  }

  add(o: Complex): Complex {
    return new Complex(this.re + o.re, this.im + o.im);
  }

  sub(o: Complex): Complex {
    return new Complex(this.re - o.re, this.im - o.im);
  }

  mul(o: Complex): Complex {
    return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re);
  }

  scale(k: number): Complex {
    return new Complex(this.re * k, this.im * k);
  }

  div(o: Complex): Complex {
    const denom = o.re * o.re + o.im * o.im;
    if (denom < 1e-30) {
      return new Complex(NaN, NaN);
    }
    return new Complex(
      (this.re * o.re + this.im * o.im) / denom,
      (this.im * o.re - this.re * o.im) / denom,
    );
  }

  inv(): Complex {
    return Complex.one().div(this);
  }

  conj(): Complex {
    return new Complex(this.re, -this.im);
  }

  neg(): Complex {
    return new Complex(-this.re, -this.im);
  }

  mag(): number {
    return Math.hypot(this.re, this.im);
  }

  rad(): number {
    return Math.atan2(this.im, this.re);
  }

  deg(): number {
    if (this.mag() < 1e-12) return 0;
    return (Math.atan2(this.im, this.re) * 180) / Math.PI;
  }

  isFinite(): boolean {
    return Number.isFinite(this.re) && Number.isFinite(this.im);
  }

  formatRect(digits = 4): string {
    const r = Math.abs(this.re) < 1e-11 ? 0 : this.re;
    const i = Math.abs(this.im) < 1e-11 ? 0 : this.im;
    if (i === 0) return r.toFixed(digits).replace(/\.?0+$/, '');
    const sign = i >= 0 ? '+' : '-';
    const rStr = r.toFixed(digits).replace(/\.?0+$/, '');
    const iStr = Math.abs(i).toFixed(digits).replace(/\.?0+$/, '');
    return `${rStr} ${sign} j${iStr}`;
  }

  formatPolar(digits = 3): string {
    const m = this.mag();
    if (m < 1e-11) return '0 ∠ 0°';
    const d = this.deg();
    const dClean = Math.abs(d) < 1e-9 ? 0 : d;
    return `${m.toFixed(digits)} ∠ ${dClean.toFixed(1)}°`;
  }
}

/**
 * Giải hệ phương trình tuyến tính thực Ax = b bằng khử Gauss có chọn phần tử trụ từng phần.
 */
export function solveLinearReal(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }

    if (maxVal < 1e-14 || !Number.isFinite(maxVal)) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) {
      sum -= M[r][c] * x[c];
    }
    x[r] = sum / M[r][r];
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}

/**
 * Giải hệ phương trình tuyến tính phức Ax = b bằng khử Gauss có chọn phần tử trụ từng phần.
 */
export function solveLinearComplex(A: Complex[][], b: Complex[]): Complex[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M: Complex[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxMag = M[col][col].mag();
    for (let r = col + 1; r < n; r++) {
      const val = M[r][col].mag();
      if (val > maxMag) {
        maxMag = val;
        pivotRow = r;
      }
    }

    if (maxMag < 1e-14 || !Number.isFinite(maxMag)) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col].div(pivot);
      if (factor.mag() === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] = M[r][c].sub(factor.mul(M[col][c]));
      }
    }
  }

  const x: Complex[] = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) {
      sum = sum.sub(M[r][c].mul(x[c]));
    }
    x[r] = sum.div(M[r][r]);
    if (!x[r].isFinite()) return null;
  }
  return x;
}
