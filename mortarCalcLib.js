const MAX_GRID_SIZE = 300;

const MORTAR_RANGE_TABLE = {
  50: 1579,
  100: 1558,
  150: 1538,
  200: 1517,
  250: 1496,
  300: 1475,
  350: 1453,
  400: 1431,
  450: 1409,
  500: 1387,
  550: 1364,
  600: 1341,
  650: 1317,
  700: 1292,
  750: 1267,
  800: 1240,
  850: 1212,
  900: 1183,
  950: 1152,
  1000: 1118,
  1050: 1081,
  1100: 1039,
  1150: 988,
  1200: 918,
  1250: 800,
};

const CHAR_MAP = new Map([
  ["a", 1],
  ["b", 2],
  ["c", 3],
  ["d", 4],
  ["e", 5],
  ["f", 6],
  ["g", 7],
  ["h", 8],
  ["i", 9],
  ["j", 10],
  ["k", 11],
  ["l", 12],
  ["m", 13],
  ["n", 14],
  ["o", 15],
  ["p", 16],
  ["q", 17],
  ["r", 18],
  ["s", 19],
  ["t", 20],
  ["u", 21],
  ["v", 22],
  ["w", 23],
  ["x", 24],
  ["y", 25],
  ["z", 26],
]);

const KEYPAD_MAP = new Map([
  [1, { x: -1, y: 1 }],
  [2, { x: 0, y: 1 }],
  [3, { x: 1, y: 1 }],
  [4, { x: -1, y: 0 }],
  [5, { x: 0, y: 0 }],
  [6, { x: 1, y: 0 }],
  [7, { x: -1, y: -1 }],
  [8, { x: 0, y: -1 }],
  [9, { x: 1, y: -1 }],
]);

export default class MortarCalc {
  validateGrid(grid) {
    if (/^[A-Za-z][0-9][0-9]?(-[0-9]*)?$/.test(grid)) {
      return true;
    }

    return false;
  }

  calculateSolution(origin, target) {
    // Calc positions
    let originPos = this.gridToCoord(origin, MAX_GRID_SIZE);
    let targetPos = this.gridToCoord(target, MAX_GRID_SIZE);

    // Calc to target
    let originPosNeg = this.multiplyVectorByScalar(originPos, -1);
    let toTarget = this.addVectorToVector(targetPos, originPosNeg);

    // Calc bearing
    let angle = this.calculateVectorAngle(toTarget).toFixed(1);

    // Calc range
    let range = Math.round(this.getVectorMagnitude(toTarget));

    let tooClose = this.isTooClose(range);
    let tooFar = this.isTooFar(range);

    // Calc mils
    let mils = null;

    if (!(tooClose || tooFar)) {
      mils = Math.round(this.linearInterpolationRangeTable(range));
    }

    return { angle, range, mils, tooClose, tooFar };
  }

  // Returns mils
  linearInterpolationRangeTable(desiredRange) {
    let min = undefined;
    let max = undefined;
    for (let key in MORTAR_RANGE_TABLE) {
      let range = parseFloat(key);
      // Get the lower bound as close to the desired range
      if (desiredRange > range && (!min || range > min)) {
        min = range;
      }

      // Get the upper bound as close to the desired range
      if (desiredRange < range && (!max || range < max)) {
        max = range;
      }
    }

    if (!min || !max) {
      // Out of bounds, would require extrapolation
      return -1;
    }

    return this.linearInterpolation(desiredRange, min, MORTAR_RANGE_TABLE[min], max, MORTAR_RANGE_TABLE[max]);
  }

  gridToCoord(grid, size) {
    let pos = {
      x: size * 0.5,
      y: size * 0.5,
    };

    let gridX = grid[0];
    let gridAndSubgrid = grid.substring(1);
    let subgridSplit = gridAndSubgrid.split("-");
    let gridY = subgridSplit[0];
    let subgrid = "";

    if (subgridSplit.length >= 2) {
      subgrid = subgridSplit[1];
    }

    let initOffset = {
      x: (CHAR_MAP.get(gridX.toLowerCase()) - 1) * size,
      y: (parseInt(gridY) - 1) * size,
    };

    pos = this.addVectorToVector(pos, initOffset);

    if (subgrid.length > 0) {
      let curr_size = size;

      for (let c of subgrid) {
        curr_size = curr_size / 3;

        let idx = parseInt(c);
        let offset = KEYPAD_MAP.get(idx);
        offset = this.multiplyVectorByScalar(offset, curr_size);
        pos = this.addVectorToVector(pos, offset);
      }
    }

    pos.y = -pos.y; // To make +Y be positive just for my brain.
    return pos;
  }

  isTooClose(range) {
    let min = 100000;
    for (let val in MORTAR_RANGE_TABLE) {
      let r = parseFloat(val);
      if (r < min) {
        min = r;
      }
    }
    return min > range;
  }

  isTooFar(range) {
    let max = -1;
    for (let val in MORTAR_RANGE_TABLE) {
      let r = parseFloat(val);
      if (r > max) {
        max = r;
      }
    }
    return max < range;
  }

  linearInterpolation(x, x1, y1, x2, y2) {
    let m = (y2 - y1) / (x2 - x1);
    let b = y2 - m * x2;

    return m * x + b;
  }

  addVectorToVector(a, b) {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
    };
  }

  multiplyVectorByScalar(v, scale) {
    return {
      x: v.x * scale,
      y: v.y * scale,
    };
  }

  getVectorMagnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  calculateVectorAngle(v) {
    let angle = (Math.atan2(v.x, v.y) / Math.PI) * 180.0;

    if (angle < 0) {
      angle = 360.0 + angle;
    }

    return angle;
  }
}
