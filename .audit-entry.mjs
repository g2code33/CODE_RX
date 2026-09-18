var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// <define:import.meta.env>
var define_import_meta_env_default = {};

// .audit-entry.tsx
import { renderToStaticMarkup } from "react-dom/server";

// node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs
import { jsx as jsx3, Fragment } from "react/jsx-runtime";
import { useMemo as useMemo2, useRef as useRef4, useState, useContext as useContext3 } from "react";

// node_modules/framer-motion/dist/es/context/LayoutGroupContext.mjs
import { createContext } from "react";
var LayoutGroupContext = createContext({});

// node_modules/framer-motion/dist/es/utils/use-constant.mjs
import { useRef } from "react";
function useConstant(init) {
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = init();
  }
  return ref.current;
}

// node_modules/framer-motion/dist/es/utils/use-isomorphic-effect.mjs
import { useLayoutEffect, useEffect } from "react";

// node_modules/framer-motion/dist/es/utils/is-browser.mjs
var isBrowser = typeof window !== "undefined";

// node_modules/framer-motion/dist/es/utils/use-isomorphic-effect.mjs
var useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

// node_modules/framer-motion/dist/es/components/AnimatePresence/PresenceChild.mjs
import { jsx as jsx2 } from "react/jsx-runtime";
import * as React3 from "react";
import { useId as useId2, useRef as useRef3, useMemo } from "react";

// node_modules/framer-motion/dist/es/context/PresenceContext.mjs
import { createContext as createContext2 } from "react";
var PresenceContext = /* @__PURE__ */ createContext2(null);

// node_modules/framer-motion/dist/es/components/AnimatePresence/PopChild.mjs
import { jsx } from "react/jsx-runtime";

// node_modules/motion-utils/dist/es/array.mjs
function addUniqueItem(arr, item) {
  if (arr.indexOf(item) === -1)
    arr.push(item);
}
function removeItem(arr, item) {
  const index = arr.indexOf(item);
  if (index > -1)
    arr.splice(index, 1);
}

// node_modules/motion-utils/dist/es/clamp.mjs
var clamp = (min, max, v) => {
  if (v > max)
    return max;
  if (v < min)
    return min;
  return v;
};

// node_modules/motion-utils/dist/es/format-error-message.mjs
function formatErrorMessage(message, errorCode) {
  return errorCode ? `${message}. For more information and steps for solving, visit https://motion.dev/troubleshooting/${errorCode}` : message;
}

// node_modules/motion-utils/dist/es/errors.mjs
var warning = () => {
};
var invariant = () => {
};
if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
  warning = (check, message, errorCode) => {
    if (!check && typeof console !== "undefined") {
      console.warn(formatErrorMessage(message, errorCode));
    }
  };
  invariant = (check, message, errorCode) => {
    if (!check) {
      throw new Error(formatErrorMessage(message, errorCode));
    }
  };
}

// node_modules/motion-utils/dist/es/global-config.mjs
var MotionGlobalConfig = {};

// node_modules/motion-utils/dist/es/is-numerical-string.mjs
var isNumericalString = (v) => /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(v);

// node_modules/motion-utils/dist/es/is-object.mjs
var isObject = (value) => typeof value === "object" && value !== null;

// node_modules/motion-utils/dist/es/is-zero-value-string.mjs
var isZeroValueString = (v) => /^0[^.\s]+$/u.test(v);

// node_modules/motion-utils/dist/es/memo.mjs
// @__NO_SIDE_EFFECTS__
function memo(callback) {
  let result;
  return () => {
    if (result === void 0)
      result = callback();
    return result;
  };
}

// node_modules/motion-utils/dist/es/noop.mjs
var noop = /* @__NO_SIDE_EFFECTS__ */ (any) => any;

// node_modules/motion-utils/dist/es/pipe.mjs
var pipe = (...transformers) => transformers.reduce((a, b) => (v) => b(a(v)));

// node_modules/motion-utils/dist/es/progress.mjs
var progress = /* @__NO_SIDE_EFFECTS__ */ (from, to, value) => {
  const range = to - from;
  return range ? (value - from) / range : 1;
};

// node_modules/motion-utils/dist/es/subscription-manager.mjs
var SubscriptionManager = class {
  constructor() {
    this.subscriptions = [];
  }
  add(handler) {
    addUniqueItem(this.subscriptions, handler);
    return () => removeItem(this.subscriptions, handler);
  }
  notify(a, b, c) {
    const numSubscriptions = this.subscriptions.length;
    if (!numSubscriptions)
      return;
    if (numSubscriptions === 1) {
      this.subscriptions[0](a, b, c);
    } else {
      for (let i = 0; i < numSubscriptions; i++) {
        const handler = this.subscriptions[i];
        handler && handler(a, b, c);
      }
    }
  }
  getSize() {
    return this.subscriptions.length;
  }
  clear() {
    this.subscriptions.length = 0;
  }
};

// node_modules/motion-utils/dist/es/time-conversion.mjs
var secondsToMilliseconds = /* @__NO_SIDE_EFFECTS__ */ (seconds) => seconds * 1e3;
var millisecondsToSeconds = /* @__NO_SIDE_EFFECTS__ */ (milliseconds) => milliseconds / 1e3;

// node_modules/motion-utils/dist/es/velocity-per-second.mjs
var velocityPerSecond = /* @__NO_SIDE_EFFECTS__ */ (velocity, frameDuration) => frameDuration ? velocity * (1e3 / frameDuration) : 0;

// node_modules/motion-utils/dist/es/warn-once.mjs
var warned = /* @__PURE__ */ new Set();
function warnOnce(condition, message, errorCode) {
  if (condition || warned.has(message))
    return;
  console.warn(formatErrorMessage(message, errorCode));
  warned.add(message);
}

// node_modules/motion-utils/dist/es/easing/cubic-bezier.mjs
var calcBezier = (t, a1, a2) => (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1) * t;
var subdivisionPrecision = 1e-7;
var subdivisionMaxIterations = 12;
function binarySubdivide(x, lowerBound, upperBound, mX1, mX2) {
  let currentX;
  let currentT;
  let i = 0;
  do {
    currentT = lowerBound + (upperBound - lowerBound) / 2;
    currentX = calcBezier(currentT, mX1, mX2) - x;
    if (currentX > 0) {
      upperBound = currentT;
    } else {
      lowerBound = currentT;
    }
  } while (Math.abs(currentX) > subdivisionPrecision && ++i < subdivisionMaxIterations);
  return currentT;
}
// @__NO_SIDE_EFFECTS__
function cubicBezier(mX1, mY1, mX2, mY2) {
  if (mX1 === mY1 && mX2 === mY2)
    return noop;
  const getTForX = (aX) => binarySubdivide(aX, 0, 1, mX1, mX2);
  return (t) => t === 0 || t === 1 ? t : calcBezier(getTForX(t), mY1, mY2);
}

// node_modules/motion-utils/dist/es/easing/modifiers/mirror.mjs
var mirrorEasing = /* @__NO_SIDE_EFFECTS__ */ (easing) => (p) => p <= 0.5 ? easing(2 * p) / 2 : (2 - easing(2 * (1 - p))) / 2;

// node_modules/motion-utils/dist/es/easing/modifiers/reverse.mjs
var reverseEasing = /* @__NO_SIDE_EFFECTS__ */ (easing) => (p) => 1 - easing(1 - p);

// node_modules/motion-utils/dist/es/easing/back.mjs
var backOut = /* @__PURE__ */ cubicBezier(0.33, 1.53, 0.69, 0.99);
var backIn = /* @__PURE__ */ reverseEasing(backOut);
var backInOut = /* @__PURE__ */ mirrorEasing(backIn);

// node_modules/motion-utils/dist/es/easing/anticipate.mjs
var anticipate = (p) => p >= 1 ? 1 : (p *= 2) < 1 ? 0.5 * backIn(p) : 0.5 * (2 - Math.pow(2, -10 * (p - 1)));

// node_modules/motion-utils/dist/es/easing/circ.mjs
var circIn = (p) => 1 - Math.sin(Math.acos(p));
var circOut = reverseEasing(circIn);
var circInOut = mirrorEasing(circIn);

// node_modules/motion-utils/dist/es/easing/ease.mjs
var easeIn = /* @__PURE__ */ cubicBezier(0.42, 0, 1, 1);
var easeOut = /* @__PURE__ */ cubicBezier(0, 0, 0.58, 1);
var easeInOut = /* @__PURE__ */ cubicBezier(0.42, 0, 0.58, 1);

// node_modules/motion-utils/dist/es/easing/utils/is-easing-array.mjs
var isEasingArray = /* @__NO_SIDE_EFFECTS__ */ (ease2) => {
  return Array.isArray(ease2) && typeof ease2[0] !== "number";
};

// node_modules/motion-utils/dist/es/easing/utils/is-bezier-definition.mjs
var isBezierDefinition = /* @__NO_SIDE_EFFECTS__ */ (easing) => Array.isArray(easing) && typeof easing[0] === "number";

// node_modules/motion-utils/dist/es/easing/utils/map.mjs
var easingLookup = {
  linear: noop,
  easeIn,
  easeInOut,
  easeOut,
  circIn,
  circInOut,
  circOut,
  backIn,
  backInOut,
  backOut,
  anticipate
};
var isValidEasing = (easing) => {
  return typeof easing === "string";
};
var easingDefinitionToFunction = (definition) => {
  if (isBezierDefinition(definition)) {
    invariant(definition.length === 4, `Cubic bezier arrays must contain four numerical values.`, "cubic-bezier-length");
    const [x1, y1, x2, y2] = definition;
    return cubicBezier(x1, y1, x2, y2);
  } else if (isValidEasing(definition)) {
    invariant(easingLookup[definition] !== void 0, `Invalid easing type '${definition}'`, "invalid-easing-type");
    return easingLookup[definition];
  }
  return definition;
};

// node_modules/motion-dom/dist/es/frameloop/order.mjs
var stepsOrder = [
  "setup",
  // Compute
  "read",
  // Read
  "resolveKeyframes",
  // Write/Read/Write/Read
  "preUpdate",
  // Compute
  "update",
  // Compute
  "preRender",
  // Compute
  "render",
  // Write
  "postRender"
  // Compute
];

// node_modules/motion-dom/dist/es/frameloop/render-step.mjs
function createRenderStep(runNextFrame) {
  let thisFrame = /* @__PURE__ */ new Set();
  let nextFrame = /* @__PURE__ */ new Set();
  let isProcessing = false;
  let flushNextFrame = false;
  const toKeepAlive = /* @__PURE__ */ new WeakSet();
  let latestFrameData = {
    delta: 0,
    timestamp: 0,
    isProcessing: false
  };
  function triggerCallback(callback) {
    if (toKeepAlive.has(callback)) {
      step.schedule(callback);
      runNextFrame();
    }
    callback(latestFrameData);
  }
  const step = {
    /**
     * Schedule a process to run on the next frame.
     */
    schedule: (callback, keepAlive = false, immediate = false) => {
      const addToCurrentFrame = immediate && isProcessing;
      const queue = addToCurrentFrame ? thisFrame : nextFrame;
      if (keepAlive)
        toKeepAlive.add(callback);
      queue.add(callback);
      return callback;
    },
    /**
     * Cancel the provided callback from running on the next frame.
     */
    cancel: (callback) => {
      nextFrame.delete(callback);
      toKeepAlive.delete(callback);
    },
    /**
     * Execute all schedule callbacks.
     */
    process: (frameData2) => {
      latestFrameData = frameData2;
      if (isProcessing) {
        flushNextFrame = true;
        return;
      }
      isProcessing = true;
      const prevFrame = thisFrame;
      thisFrame = nextFrame;
      nextFrame = prevFrame;
      thisFrame.forEach(triggerCallback);
      thisFrame.clear();
      isProcessing = false;
      if (flushNextFrame) {
        flushNextFrame = false;
        step.process(frameData2);
      }
    }
  };
  return step;
}

// node_modules/motion-dom/dist/es/frameloop/batcher.mjs
var maxElapsed = 40;
function createRenderBatcher(scheduleNextBatch, allowKeepAlive) {
  let runNextFrame = false;
  let useDefaultElapsed = true;
  const state = {
    delta: 0,
    timestamp: 0,
    isProcessing: false
  };
  const flagRunNextFrame = () => runNextFrame = true;
  const steps = stepsOrder.reduce((acc, key) => {
    acc[key] = createRenderStep(flagRunNextFrame);
    return acc;
  }, {});
  const { setup, read, resolveKeyframes, preUpdate, update, preRender, render: render2, postRender } = steps;
  const processBatch = () => {
    const useManualTiming = MotionGlobalConfig.useManualTiming;
    const timestamp = useManualTiming ? state.timestamp : performance.now();
    runNextFrame = false;
    if (!useManualTiming) {
      state.delta = useDefaultElapsed ? 1e3 / 60 : Math.max(Math.min(timestamp - state.timestamp, maxElapsed), 1);
    }
    state.timestamp = timestamp;
    state.isProcessing = true;
    setup.process(state);
    read.process(state);
    resolveKeyframes.process(state);
    preUpdate.process(state);
    update.process(state);
    preRender.process(state);
    render2.process(state);
    postRender.process(state);
    state.isProcessing = false;
    if (runNextFrame && allowKeepAlive) {
      useDefaultElapsed = false;
      scheduleNextBatch(processBatch);
    }
  };
  const wake = () => {
    runNextFrame = true;
    useDefaultElapsed = true;
    if (!state.isProcessing) {
      scheduleNextBatch(processBatch);
    }
  };
  const schedule = stepsOrder.reduce((acc, key) => {
    const step = steps[key];
    acc[key] = (process2, keepAlive = false, immediate = false) => {
      if (!runNextFrame)
        wake();
      return step.schedule(process2, keepAlive, immediate);
    };
    return acc;
  }, {});
  const cancel = (process2) => {
    for (let i = 0; i < stepsOrder.length; i++) {
      steps[stepsOrder[i]].cancel(process2);
    }
  };
  return { schedule, cancel, state, steps };
}

// node_modules/motion-dom/dist/es/frameloop/frame.mjs
var { schedule: frame, cancel: cancelFrame, state: frameData, steps: frameSteps } = /* @__PURE__ */ createRenderBatcher(typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : noop, true);

// node_modules/motion-dom/dist/es/frameloop/sync-time.mjs
var now;
function clearTime() {
  now = void 0;
}
var time = {
  now: () => {
    if (now === void 0) {
      time.set(frameData.isProcessing || MotionGlobalConfig.useManualTiming ? frameData.timestamp : performance.now());
    }
    return now;
  },
  set: (newTime) => {
    now = newTime;
    queueMicrotask(clearTime);
  }
};

// node_modules/motion-dom/dist/es/animation/utils/is-css-variable.mjs
var checkStringStartsWith = (token) => (key) => typeof key === "string" && key.startsWith(token);
var isCSSVariableName = /* @__PURE__ */ checkStringStartsWith("--");
var startsAsVariableToken = /* @__PURE__ */ checkStringStartsWith("var(--");
var isCSSVariableToken = (value) => {
  const startsWithToken = startsAsVariableToken(value);
  if (!startsWithToken)
    return false;
  return singleCssVariableRegex.test(value.split("/*")[0].trim());
};
var singleCssVariableRegex = /var\(--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)$/iu;
function containsCSSVariable(value) {
  if (typeof value !== "string")
    return false;
  return value.split("/*")[0].includes("var(--");
}

// node_modules/motion-dom/dist/es/value/types/numbers/index.mjs
var number = {
  test: (v) => typeof v === "number",
  parse: parseFloat,
  transform: (v) => v
};
var alpha = {
  ...number,
  transform: (v) => clamp(0, 1, v)
};
var scale = {
  ...number,
  default: 1
};

// node_modules/motion-dom/dist/es/value/types/utils/sanitize.mjs
var sanitize = (v) => Math.round(v * 1e5) / 1e5;

// node_modules/motion-dom/dist/es/value/types/utils/float-regex.mjs
var floatRegex = /-?(?:\d+(?:\.\d+)?|\.\d+)/gu;

// node_modules/motion-dom/dist/es/value/types/utils/is-nullish.mjs
function isNullish(v) {
  return v == null;
}

// node_modules/motion-dom/dist/es/value/types/utils/single-color-regex.mjs
var singleColorRegex = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))$/iu;

// node_modules/motion-dom/dist/es/value/types/color/utils.mjs
var isColorString = (type, testProp) => (v) => {
  return Boolean(typeof v === "string" && singleColorRegex.test(v) && v.startsWith(type) || testProp && !isNullish(v) && Object.prototype.hasOwnProperty.call(v, testProp));
};
var splitColor = (aName, bName, cName) => (v) => {
  if (typeof v !== "string")
    return v;
  const [a, b, c, alpha2] = v.match(floatRegex);
  return {
    [aName]: parseFloat(a),
    [bName]: parseFloat(b),
    [cName]: parseFloat(c),
    alpha: alpha2 !== void 0 ? parseFloat(alpha2) : 1
  };
};

// node_modules/motion-dom/dist/es/value/types/color/rgba.mjs
var clampRgbUnit = (v) => clamp(0, 255, v);
var rgbUnit = {
  ...number,
  transform: (v) => Math.round(clampRgbUnit(v))
};
var rgba = {
  test: /* @__PURE__ */ isColorString("rgb", "red"),
  parse: /* @__PURE__ */ splitColor("red", "green", "blue"),
  transform: ({ red, green, blue, alpha: alpha$1 = 1 }) => "rgba(" + rgbUnit.transform(red) + ", " + rgbUnit.transform(green) + ", " + rgbUnit.transform(blue) + ", " + sanitize(alpha.transform(alpha$1)) + ")"
};

// node_modules/motion-dom/dist/es/value/types/color/hex.mjs
function parseHex(v) {
  let r = "";
  let g = "";
  let b = "";
  let a = "";
  if (v.length > 5) {
    r = v.substring(1, 3);
    g = v.substring(3, 5);
    b = v.substring(5, 7);
    a = v.substring(7, 9);
  } else {
    r = v.substring(1, 2);
    g = v.substring(2, 3);
    b = v.substring(3, 4);
    a = v.substring(4, 5);
    r += r;
    g += g;
    b += b;
    a += a;
  }
  return {
    red: parseInt(r, 16),
    green: parseInt(g, 16),
    blue: parseInt(b, 16),
    alpha: a ? parseInt(a, 16) / 255 : 1
  };
}
var hex = {
  test: /* @__PURE__ */ isColorString("#"),
  parse: parseHex,
  transform: rgba.transform
};

// node_modules/motion-dom/dist/es/value/types/numbers/units.mjs
var createUnitType = /* @__NO_SIDE_EFFECTS__ */ (unit) => ({
  test: (v) => typeof v === "string" && v.endsWith(unit) && v.split(" ").length === 1,
  parse: parseFloat,
  transform: (v) => `${v}${unit}`
});
var degrees = /* @__PURE__ */ createUnitType("deg");
var percent = /* @__PURE__ */ createUnitType("%");
var px = /* @__PURE__ */ createUnitType("px");
var vh = /* @__PURE__ */ createUnitType("vh");
var vw = /* @__PURE__ */ createUnitType("vw");
var progressPercentage = /* @__PURE__ */ (() => ({
  ...percent,
  parse: (v) => percent.parse(v) / 100,
  transform: (v) => percent.transform(v * 100)
}))();

// node_modules/motion-dom/dist/es/value/types/color/hsla.mjs
var hsla = {
  test: /* @__PURE__ */ isColorString("hsl", "hue"),
  parse: /* @__PURE__ */ splitColor("hue", "saturation", "lightness"),
  transform: ({ hue, saturation, lightness, alpha: alpha$1 = 1 }) => {
    return "hsla(" + Math.round(hue) + ", " + percent.transform(sanitize(saturation)) + ", " + percent.transform(sanitize(lightness)) + ", " + sanitize(alpha.transform(alpha$1)) + ")";
  }
};

// node_modules/motion-dom/dist/es/value/types/color/index.mjs
var color = {
  test: (v) => rgba.test(v) || hex.test(v) || hsla.test(v),
  parse: (v) => {
    if (rgba.test(v)) {
      return rgba.parse(v);
    } else if (hsla.test(v)) {
      return hsla.parse(v);
    } else {
      return hex.parse(v);
    }
  },
  transform: (v) => {
    return typeof v === "string" ? v : v.hasOwnProperty("red") ? rgba.transform(v) : hsla.transform(v);
  },
  getAnimatableNone: (v) => {
    const parsed = color.parse(v);
    parsed.alpha = 0;
    return color.transform(parsed);
  }
};

// node_modules/motion-dom/dist/es/value/types/utils/color-regex.mjs
var colorRegex = /(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\))/giu;

// node_modules/motion-dom/dist/es/value/types/complex/index.mjs
function test(v) {
  return isNaN(v) && typeof v === "string" && (v.match(floatRegex)?.length || 0) + (v.match(colorRegex)?.length || 0) > 0;
}
var NUMBER_TOKEN = "number";
var COLOR_TOKEN = "color";
var VAR_TOKEN = "var";
var VAR_FUNCTION_TOKEN = "var(";
var SPLIT_TOKEN = "${}";
var complexRegex = /var\s*\(\s*--(?:[\w-]+\s*|[\w-]+\s*,(?:\s*[^)(\s]|\s*\((?:[^)(]|\([^)(]*\))*\))+\s*)\)|#[\da-f]{3,8}|(?:rgb|hsl)a?\((?:-?[\d.]+%?[,\s]+){2}-?[\d.]+%?\s*(?:[,/]\s*)?(?:\b\d+(?:\.\d+)?|\.\d+)?%?\)|-?(?:\d+(?:\.\d+)?|\.\d+)/giu;
function analyseComplexValue(value) {
  const originalValue = value.toString();
  const values = [];
  const indexes = {
    color: [],
    number: [],
    var: []
  };
  const types = [];
  let i = 0;
  const tokenised = originalValue.replace(complexRegex, (parsedValue) => {
    if (color.test(parsedValue)) {
      indexes.color.push(i);
      types.push(COLOR_TOKEN);
      values.push(color.parse(parsedValue));
    } else if (parsedValue.startsWith(VAR_FUNCTION_TOKEN)) {
      indexes.var.push(i);
      types.push(VAR_TOKEN);
      values.push(parsedValue);
    } else {
      indexes.number.push(i);
      types.push(NUMBER_TOKEN);
      values.push(parseFloat(parsedValue));
    }
    ++i;
    return SPLIT_TOKEN;
  });
  const split = tokenised.split(SPLIT_TOKEN);
  return { values, split, indexes, types };
}
function parseComplexValue(v) {
  return analyseComplexValue(v).values;
}
function buildTransformer({ split, types }) {
  const numSections = split.length;
  return (v) => {
    let output = "";
    for (let i = 0; i < numSections; i++) {
      output += split[i];
      if (v[i] !== void 0) {
        const type = types[i];
        if (type === NUMBER_TOKEN) {
          output += sanitize(v[i]);
        } else if (type === COLOR_TOKEN) {
          output += color.transform(v[i]);
        } else {
          output += v[i];
        }
      }
    }
    return output;
  };
}
function createTransformer(source) {
  return buildTransformer(analyseComplexValue(source));
}
var convertNumbersToZero = (v) => typeof v === "number" ? 0 : color.test(v) ? color.getAnimatableNone(v) : v;
var convertToZero = (value, splitBefore) => {
  if (typeof value === "number") {
    return splitBefore?.trim().endsWith("/") ? value : 0;
  }
  return convertNumbersToZero(value);
};
function getAnimatableNone(v) {
  const info = analyseComplexValue(v);
  const transformer = buildTransformer(info);
  return transformer(info.values.map((value, i) => convertToZero(value, info.split[i])));
}
var complex = {
  test,
  parse: parseComplexValue,
  createTransformer,
  getAnimatableNone
};

// node_modules/motion-dom/dist/es/value/types/color/hsla-to-rgba.mjs
function hueToRgb(p, q, t) {
  if (t < 0)
    t += 1;
  if (t > 1)
    t -= 1;
  if (t < 1 / 6)
    return p + (q - p) * 6 * t;
  if (t < 1 / 2)
    return q;
  if (t < 2 / 3)
    return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslaToRgba({ hue, saturation, lightness, alpha: alpha2 }) {
  hue /= 360;
  saturation /= 100;
  lightness /= 100;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (!saturation) {
    red = green = blue = lightness;
  } else {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    red = hueToRgb(p, q, hue + 1 / 3);
    green = hueToRgb(p, q, hue);
    blue = hueToRgb(p, q, hue - 1 / 3);
  }
  return {
    red: Math.round(red * 255),
    green: Math.round(green * 255),
    blue: Math.round(blue * 255),
    alpha: alpha2
  };
}

// node_modules/motion-dom/dist/es/utils/mix/immediate.mjs
function mixImmediate(a, b) {
  return (p) => p > 0 ? b : a;
}

// node_modules/motion-dom/dist/es/utils/mix/number.mjs
var mixNumber = (from, to, progress2) => {
  return from + (to - from) * progress2;
};

// node_modules/motion-dom/dist/es/utils/mix/color.mjs
var mixLinearColor = (from, to, v) => {
  const fromExpo = from * from;
  const expo = v * (to * to - fromExpo) + fromExpo;
  return expo < 0 ? 0 : Math.sqrt(expo);
};
var colorTypes = [hex, rgba, hsla];
var getColorType = (v) => colorTypes.find((type) => type.test(v));
function asRGBA(color2) {
  const type = getColorType(color2);
  warning(Boolean(type), `'${color2}' is not an animatable color. Use the equivalent color code instead.`, "color-not-animatable");
  if (!Boolean(type))
    return false;
  let model = type.parse(color2);
  if (type === hsla) {
    model = hslaToRgba(model);
  }
  return model;
}
var mixColor = (from, to) => {
  const fromRGBA = asRGBA(from);
  const toRGBA = asRGBA(to);
  if (!fromRGBA || !toRGBA) {
    return mixImmediate(from, to);
  }
  const blended = { ...fromRGBA };
  return (v) => {
    blended.red = mixLinearColor(fromRGBA.red, toRGBA.red, v);
    blended.green = mixLinearColor(fromRGBA.green, toRGBA.green, v);
    blended.blue = mixLinearColor(fromRGBA.blue, toRGBA.blue, v);
    blended.alpha = mixNumber(fromRGBA.alpha, toRGBA.alpha, v);
    return rgba.transform(blended);
  };
};

// node_modules/motion-dom/dist/es/utils/mix/visibility.mjs
var invisibleValues = /* @__PURE__ */ new Set(["none", "hidden"]);
function mixVisibility(origin, target) {
  if (invisibleValues.has(origin)) {
    return (p) => p <= 0 ? origin : target;
  } else {
    return (p) => p >= 1 ? target : origin;
  }
}

// node_modules/motion-dom/dist/es/utils/mix/complex.mjs
function mixNumber2(a, b) {
  return (p) => mixNumber(a, b, p);
}
function getMixer(a) {
  if (typeof a === "number") {
    return mixNumber2;
  } else if (typeof a === "string") {
    return isCSSVariableToken(a) ? mixImmediate : color.test(a) ? mixColor : mixComplex;
  } else if (Array.isArray(a)) {
    return mixArray;
  } else if (typeof a === "object") {
    return color.test(a) ? mixColor : mixObject;
  }
  return mixImmediate;
}
function mixArray(a, b) {
  const output = [...a];
  const numValues = output.length;
  const blendValue = a.map((v, i) => getMixer(v)(v, b[i]));
  return (p) => {
    for (let i = 0; i < numValues; i++) {
      output[i] = blendValue[i](p);
    }
    return output;
  };
}
function mixObject(a, b) {
  const output = { ...a, ...b };
  const blendValue = {};
  for (const key in output) {
    if (a[key] !== void 0 && b[key] !== void 0) {
      blendValue[key] = getMixer(a[key])(a[key], b[key]);
    }
  }
  return (v) => {
    for (const key in blendValue) {
      output[key] = blendValue[key](v);
    }
    return output;
  };
}
function matchOrder(origin, target) {
  const orderedOrigin = [];
  const pointers = { color: 0, var: 0, number: 0 };
  for (let i = 0; i < target.values.length; i++) {
    const type = target.types[i];
    const originIndex = origin.indexes[type][pointers[type]];
    const originValue = origin.values[originIndex] ?? 0;
    orderedOrigin[i] = originValue;
    pointers[type]++;
  }
  return orderedOrigin;
}
var mixComplex = (origin, target) => {
  const template = complex.createTransformer(target);
  const originStats = analyseComplexValue(origin);
  const targetStats = analyseComplexValue(target);
  const canInterpolate = originStats.indexes.var.length === targetStats.indexes.var.length && originStats.indexes.color.length === targetStats.indexes.color.length && originStats.indexes.number.length >= targetStats.indexes.number.length;
  if (canInterpolate) {
    if (invisibleValues.has(origin) && !targetStats.values.length || invisibleValues.has(target) && !originStats.values.length) {
      return mixVisibility(origin, target);
    }
    return pipe(mixArray(matchOrder(originStats, targetStats), targetStats.values), template);
  } else {
    warning(true, `Complex values '${origin}' and '${target}' too different to mix. Ensure all colors are of the same type, and that each contains the same quantity of number and color values. Falling back to instant transition.`, "complex-values-different");
    return mixImmediate(origin, target);
  }
};

// node_modules/motion-dom/dist/es/utils/mix/index.mjs
function mix(from, to, p) {
  if (typeof from === "number" && typeof to === "number" && typeof p === "number") {
    return mixNumber(from, to, p);
  }
  const mixer = getMixer(from);
  return mixer(from, to);
}

// node_modules/motion-dom/dist/es/animation/drivers/frame.mjs
var frameloopDriver = (update) => {
  const passTimestamp = ({ timestamp }) => update(timestamp);
  return {
    start: (keepAlive = true) => frame.update(passTimestamp, keepAlive),
    stop: () => cancelFrame(passTimestamp),
    /**
     * If we're processing this frame we can use the
     * framelocked timestamp to keep things in sync.
     */
    now: () => frameData.isProcessing ? frameData.timestamp : time.now()
  };
};

// node_modules/motion-dom/dist/es/animation/waapi/utils/linear.mjs
var generateLinearEasing = (easing, duration, resolution = 10) => {
  let points = "";
  const numPoints = Math.max(Math.round(duration / resolution), 2);
  for (let i = 0; i < numPoints; i++) {
    points += Math.round(easing(i / (numPoints - 1)) * 1e4) / 1e4 + ", ";
  }
  return `linear(${points.substring(0, points.length - 2)})`;
};

// node_modules/motion-dom/dist/es/animation/generators/utils/calc-duration.mjs
var maxGeneratorDuration = 2e4;
function calcGeneratorDuration(generator) {
  let duration = 0;
  const timeStep = 50;
  let state = generator.next(duration);
  while (!state.done && duration < maxGeneratorDuration) {
    duration += timeStep;
    state = generator.next(duration);
  }
  return duration >= maxGeneratorDuration ? Infinity : duration;
}

// node_modules/motion-dom/dist/es/animation/generators/utils/create-generator-easing.mjs
function createGeneratorEasing(options, scale2 = 100, createGenerator) {
  const generator = createGenerator({ ...options, keyframes: [0, scale2] });
  const duration = Math.min(calcGeneratorDuration(generator), maxGeneratorDuration);
  return {
    type: "keyframes",
    ease: (progress2) => {
      return generator.next(duration * progress2).value / scale2;
    },
    duration: millisecondsToSeconds(duration)
  };
}

// node_modules/motion-dom/dist/es/animation/generators/spring.mjs
var springDefaults = {
  // Default spring physics
  stiffness: 100,
  damping: 10,
  mass: 1,
  velocity: 0,
  // Default duration/bounce-based options
  duration: 800,
  // in ms
  bounce: 0.3,
  visualDuration: 0.3,
  // in seconds
  // Rest thresholds
  restSpeed: {
    granular: 0.01,
    default: 2
  },
  restDelta: {
    granular: 5e-3,
    default: 0.5
  },
  // Limits
  minDuration: 0.01,
  // in seconds
  maxDuration: 10,
  // in seconds
  minDamping: 0.05,
  maxDamping: 1
};
function calcAngularFreq(undampedFreq, dampingRatio) {
  return undampedFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
}
var rootIterations = 12;
function approximateRoot(envelope, derivative, initialGuess) {
  let result = initialGuess;
  for (let i = 1; i < rootIterations; i++) {
    result = result - envelope(result) / derivative(result);
  }
  return result;
}
var safeMin = 1e-3;
function findSpring({ duration = springDefaults.duration, bounce = springDefaults.bounce, velocity = springDefaults.velocity, mass = springDefaults.mass }) {
  let envelope;
  let derivative;
  warning(duration <= secondsToMilliseconds(springDefaults.maxDuration), "Spring duration must be 10 seconds or less", "spring-duration-limit");
  let dampingRatio = 1 - bounce;
  dampingRatio = clamp(springDefaults.minDamping, springDefaults.maxDamping, dampingRatio);
  duration = clamp(springDefaults.minDuration, springDefaults.maxDuration, millisecondsToSeconds(duration));
  if (dampingRatio < 1) {
    envelope = (undampedFreq2) => {
      const exponentialDecay = undampedFreq2 * dampingRatio;
      const delta = exponentialDecay * duration;
      const a = exponentialDecay - velocity;
      const b = calcAngularFreq(undampedFreq2, dampingRatio);
      const c = Math.exp(-delta);
      return safeMin - a / b * c;
    };
    derivative = (undampedFreq2) => {
      const exponentialDecay = undampedFreq2 * dampingRatio;
      const delta = exponentialDecay * duration;
      const d = delta * velocity + velocity;
      const e = Math.pow(dampingRatio, 2) * Math.pow(undampedFreq2, 2) * duration;
      const f = Math.exp(-delta);
      const g = calcAngularFreq(Math.pow(undampedFreq2, 2), dampingRatio);
      const factor = -envelope(undampedFreq2) + safeMin > 0 ? -1 : 1;
      return factor * ((d - e) * f) / g;
    };
  } else {
    envelope = (undampedFreq2) => {
      const a = Math.exp(-undampedFreq2 * duration);
      const b = (undampedFreq2 - velocity) * duration + 1;
      return -safeMin + a * b;
    };
    derivative = (undampedFreq2) => {
      const a = Math.exp(-undampedFreq2 * duration);
      const b = (velocity - undampedFreq2) * (duration * duration);
      return a * b;
    };
  }
  const initialGuess = 5 / duration;
  const undampedFreq = approximateRoot(envelope, derivative, initialGuess);
  duration = secondsToMilliseconds(duration);
  if (isNaN(undampedFreq)) {
    return {
      stiffness: springDefaults.stiffness,
      damping: springDefaults.damping,
      duration
    };
  } else {
    const stiffness = Math.pow(undampedFreq, 2) * mass;
    return {
      stiffness,
      damping: dampingRatio * 2 * Math.sqrt(mass * stiffness),
      duration
    };
  }
}
var durationKeys = ["duration", "bounce"];
var physicsKeys = ["stiffness", "damping", "mass"];
function isSpringType(options, keys) {
  return keys.some((key) => options[key] !== void 0);
}
function getSpringOptions(options) {
  let springOptions = {
    velocity: springDefaults.velocity,
    stiffness: springDefaults.stiffness,
    damping: springDefaults.damping,
    mass: springDefaults.mass,
    isResolvedFromDuration: false,
    ...options
  };
  if (!isSpringType(options, physicsKeys) && isSpringType(options, durationKeys)) {
    springOptions.velocity = 0;
    if (options.visualDuration) {
      const visualDuration = options.visualDuration;
      const root = 2 * Math.PI / (visualDuration * 1.2);
      const stiffness = root * root;
      const damping = 2 * clamp(0.05, 1, 1 - (options.bounce || 0)) * Math.sqrt(stiffness);
      springOptions = {
        ...springOptions,
        mass: springDefaults.mass,
        stiffness,
        damping
      };
    } else {
      const derived = findSpring({ ...options, velocity: 0 });
      springOptions = {
        ...springOptions,
        ...derived,
        mass: springDefaults.mass
      };
      springOptions.isResolvedFromDuration = true;
    }
  }
  return springOptions;
}
function spring(optionsOrVisualDuration = springDefaults.visualDuration, bounce = springDefaults.bounce) {
  const options = typeof optionsOrVisualDuration !== "object" ? {
    visualDuration: optionsOrVisualDuration,
    keyframes: [0, 1],
    bounce
  } : optionsOrVisualDuration;
  let { restSpeed, restDelta } = options;
  const origin = options.keyframes[0];
  const target = options.keyframes[options.keyframes.length - 1];
  const state = { done: false, value: origin };
  const { stiffness, damping, mass, duration, velocity, isResolvedFromDuration } = getSpringOptions({
    ...options,
    velocity: -millisecondsToSeconds(options.velocity || 0)
  });
  const initialVelocity = velocity || 0;
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const initialDelta = target - origin;
  const undampedAngularFreq = millisecondsToSeconds(Math.sqrt(stiffness / mass));
  const isGranularScale = Math.abs(initialDelta) < 5;
  restSpeed || (restSpeed = isGranularScale ? springDefaults.restSpeed.granular : springDefaults.restSpeed.default);
  restDelta || (restDelta = isGranularScale ? springDefaults.restDelta.granular : springDefaults.restDelta.default);
  let resolveSpring;
  let resolveVelocity;
  let angularFreq;
  let A;
  let sinCoeff;
  let cosCoeff;
  if (dampingRatio < 1) {
    angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio);
    A = (initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / angularFreq;
    resolveSpring = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      return target - envelope * (A * Math.sin(angularFreq * t) + initialDelta * Math.cos(angularFreq * t));
    };
    sinCoeff = dampingRatio * undampedAngularFreq * A + initialDelta * angularFreq;
    cosCoeff = dampingRatio * undampedAngularFreq * initialDelta - A * angularFreq;
    resolveVelocity = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      return envelope * (sinCoeff * Math.sin(angularFreq * t) + cosCoeff * Math.cos(angularFreq * t));
    };
  } else if (dampingRatio === 1) {
    resolveSpring = (t) => target - Math.exp(-undampedAngularFreq * t) * (initialDelta + (initialVelocity + undampedAngularFreq * initialDelta) * t);
    const C = initialVelocity + undampedAngularFreq * initialDelta;
    resolveVelocity = (t) => Math.exp(-undampedAngularFreq * t) * (undampedAngularFreq * C * t - initialVelocity);
  } else {
    const dampedAngularFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
    resolveSpring = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      const freqForT = Math.min(dampedAngularFreq * t, 300);
      return target - envelope * ((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) * Math.sinh(freqForT) + dampedAngularFreq * initialDelta * Math.cosh(freqForT)) / dampedAngularFreq;
    };
    const P = (initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / dampedAngularFreq;
    const sinhCoeff = dampingRatio * undampedAngularFreq * P - initialDelta * dampedAngularFreq;
    const coshCoeff = dampingRatio * undampedAngularFreq * initialDelta - P * dampedAngularFreq;
    resolveVelocity = (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      const freqForT = Math.min(dampedAngularFreq * t, 300);
      return envelope * (sinhCoeff * Math.sinh(freqForT) + coshCoeff * Math.cosh(freqForT));
    };
  }
  const generator = {
    calculatedDuration: isResolvedFromDuration ? duration || null : null,
    velocity: (t) => secondsToMilliseconds(resolveVelocity(t)),
    next: (t) => {
      if (!isResolvedFromDuration && dampingRatio < 1) {
        const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
        const sin = Math.sin(angularFreq * t);
        const cos = Math.cos(angularFreq * t);
        const current2 = target - envelope * (A * sin + initialDelta * cos);
        const currentVelocity = secondsToMilliseconds(envelope * (sinCoeff * sin + cosCoeff * cos));
        state.done = Math.abs(currentVelocity) <= restSpeed && Math.abs(target - current2) <= restDelta;
        state.value = state.done ? target : current2;
        return state;
      }
      const current = resolveSpring(t);
      if (!isResolvedFromDuration) {
        const currentVelocity = secondsToMilliseconds(resolveVelocity(t));
        state.done = Math.abs(currentVelocity) <= restSpeed && Math.abs(target - current) <= restDelta;
      } else {
        state.done = t >= duration;
      }
      state.value = state.done ? target : current;
      return state;
    },
    toString: () => {
      const calculatedDuration = Math.min(calcGeneratorDuration(generator), maxGeneratorDuration);
      const easing = generateLinearEasing((progress2) => generator.next(calculatedDuration * progress2).value, calculatedDuration, 30);
      return calculatedDuration + "ms " + easing;
    },
    toTransition: () => {
    }
  };
  return generator;
}
spring.applyToOptions = (options) => {
  const generatorOptions = createGeneratorEasing(options, 100, spring);
  options.ease = generatorOptions.ease;
  options.duration = secondsToMilliseconds(generatorOptions.duration);
  options.type = "keyframes";
  return options;
};

// node_modules/motion-dom/dist/es/animation/generators/utils/velocity.mjs
var velocitySampleDuration = 5;
function getGeneratorVelocity(resolveValue, t, current) {
  const prevT = Math.max(t - velocitySampleDuration, 0);
  return velocityPerSecond(current - resolveValue(prevT), t - prevT);
}

// node_modules/motion-dom/dist/es/animation/generators/inertia.mjs
function inertia({ keyframes: keyframes2, velocity = 0, power = 0.8, timeConstant = 325, bounceDamping = 10, bounceStiffness = 500, modifyTarget, min, max, restDelta = 0.5, restSpeed }) {
  const origin = keyframes2[0];
  const state = {
    done: false,
    value: origin
  };
  const isOutOfBounds = (v) => min !== void 0 && v < min || max !== void 0 && v > max;
  const nearestBoundary = (v) => {
    if (min === void 0)
      return max;
    if (max === void 0)
      return min;
    return Math.abs(min - v) < Math.abs(max - v) ? min : max;
  };
  let amplitude = power * velocity;
  const ideal = origin + amplitude;
  const target = modifyTarget === void 0 ? ideal : modifyTarget(ideal);
  if (target !== ideal)
    amplitude = target - origin;
  const calcDelta = (t) => -amplitude * Math.exp(-t / timeConstant);
  const calcLatest = (t) => target + calcDelta(t);
  const applyFriction = (t) => {
    const delta = calcDelta(t);
    const latest = calcLatest(t);
    state.done = Math.abs(delta) <= restDelta;
    state.value = state.done ? target : latest;
  };
  let timeReachedBoundary;
  let spring$1;
  const checkCatchBoundary = (t) => {
    if (!isOutOfBounds(state.value))
      return;
    timeReachedBoundary = t;
    spring$1 = spring({
      keyframes: [state.value, nearestBoundary(state.value)],
      velocity: getGeneratorVelocity(calcLatest, t, state.value),
      // TODO: This should be passing * 1000
      damping: bounceDamping,
      stiffness: bounceStiffness,
      restDelta,
      restSpeed
    });
  };
  checkCatchBoundary(0);
  return {
    calculatedDuration: null,
    next: (t) => {
      let hasUpdatedFrame = false;
      if (!spring$1 && timeReachedBoundary === void 0) {
        hasUpdatedFrame = true;
        applyFriction(t);
        checkCatchBoundary(t);
      }
      if (timeReachedBoundary !== void 0 && t >= timeReachedBoundary) {
        return spring$1.next(t - timeReachedBoundary);
      } else {
        !hasUpdatedFrame && applyFriction(t);
        return state;
      }
    }
  };
}

// node_modules/motion-dom/dist/es/utils/interpolate.mjs
function createMixers(output, ease2, customMixer) {
  const mixers = [];
  const mixerFactory = customMixer || MotionGlobalConfig.mix || mix;
  const numMixers = output.length - 1;
  for (let i = 0; i < numMixers; i++) {
    let mixer = mixerFactory(output[i], output[i + 1]);
    if (ease2) {
      const easingFunction = Array.isArray(ease2) ? ease2[i] || noop : ease2;
      mixer = pipe(easingFunction, mixer);
    }
    mixers.push(mixer);
  }
  return mixers;
}
function interpolate(input, output, { clamp: isClamp = true, ease: ease2, mixer } = {}) {
  const inputLength = input.length;
  invariant(inputLength === output.length, "Both input and output ranges must be the same length", "range-length");
  if (inputLength === 1)
    return () => output[0];
  if (inputLength === 2 && output[0] === output[1])
    return () => output[1];
  const isZeroDeltaRange = input[0] === input[1];
  if (input[0] > input[inputLength - 1]) {
    input = [...input].reverse();
    output = [...output].reverse();
  }
  const mixers = createMixers(output, ease2, mixer);
  const numMixers = mixers.length;
  const interpolator = (v) => {
    if (isZeroDeltaRange && v < input[0])
      return output[0];
    let i = 0;
    if (numMixers > 1) {
      for (; i < input.length - 2; i++) {
        if (v < input[i + 1])
          break;
      }
    }
    const progressInRange = progress(input[i], input[i + 1], v);
    return mixers[i](progressInRange);
  };
  return isClamp ? (v) => interpolator(clamp(input[0], input[inputLength - 1], v)) : interpolator;
}

// node_modules/motion-dom/dist/es/animation/keyframes/offsets/fill.mjs
function fillOffset(offset, remaining) {
  const min = offset[offset.length - 1];
  for (let i = 1; i <= remaining; i++) {
    const offsetProgress = progress(0, remaining, i);
    offset.push(mixNumber(min, 1, offsetProgress));
  }
}

// node_modules/motion-dom/dist/es/animation/keyframes/offsets/default.mjs
function defaultOffset(arr) {
  const offset = [0];
  fillOffset(offset, arr.length - 1);
  return offset;
}

// node_modules/motion-dom/dist/es/animation/keyframes/offsets/time.mjs
function convertOffsetToTimes(offset, duration) {
  return offset.map((o) => o * duration);
}

// node_modules/motion-dom/dist/es/animation/generators/keyframes.mjs
function defaultEasing(values, easing) {
  return values.map(() => easing || easeInOut).splice(0, values.length - 1);
}
function keyframes({ duration = 300, keyframes: keyframeValues, times, ease: ease2 = "easeInOut" }) {
  const easingFunctions = isEasingArray(ease2) ? ease2.map(easingDefinitionToFunction) : easingDefinitionToFunction(ease2);
  const state = {
    done: false,
    value: keyframeValues[0]
  };
  const absoluteTimes = convertOffsetToTimes(
    // Only use the provided offsets if they're the correct length
    // TODO Maybe we should warn here if there's a length mismatch
    times && times.length === keyframeValues.length ? times : defaultOffset(keyframeValues),
    duration
  );
  const mapTimeToKeyframe = interpolate(absoluteTimes, keyframeValues, {
    ease: Array.isArray(easingFunctions) ? easingFunctions : defaultEasing(keyframeValues, easingFunctions)
  });
  return {
    calculatedDuration: duration,
    next: (t) => {
      state.value = mapTimeToKeyframe(t);
      state.done = t >= duration;
      return state;
    }
  };
}

// node_modules/motion-dom/dist/es/animation/keyframes/get-final.mjs
var isNotNull = (value) => value !== null;
function getFinalKeyframe(keyframes2, { repeat, repeatType = "loop" }, finalKeyframe, speed = 1) {
  const resolvedKeyframes = keyframes2.filter(isNotNull);
  const useFirstKeyframe = speed < 0 || repeat && repeatType !== "loop" && repeat % 2 === 1;
  const index = useFirstKeyframe ? 0 : resolvedKeyframes.length - 1;
  return !index || finalKeyframe === void 0 ? resolvedKeyframes[index] : finalKeyframe;
}

// node_modules/motion-dom/dist/es/animation/utils/replace-transition-type.mjs
var transitionTypeMap = {
  decay: inertia,
  inertia,
  tween: keyframes,
  keyframes,
  spring
};
function replaceTransitionType(transition) {
  if (typeof transition.type === "string") {
    transition.type = transitionTypeMap[transition.type];
  }
}

// node_modules/motion-dom/dist/es/animation/utils/WithPromise.mjs
var WithPromise = class {
  constructor() {
    this.updateFinished();
  }
  get finished() {
    return this._finished;
  }
  updateFinished() {
    this._finished = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  notifyFinished() {
    this.resolve();
  }
  /**
   * Allows the animation to be awaited.
   *
   * @deprecated Use `finished` instead.
   */
  then(onResolve, onReject) {
    return this.finished.then(onResolve, onReject);
  }
};

// node_modules/motion-dom/dist/es/animation/JSAnimation.mjs
var percentToProgress = (percent2) => percent2 / 100;
var JSAnimation = class extends WithPromise {
  constructor(options) {
    super();
    this.state = "idle";
    this.startTime = null;
    this.isStopped = false;
    this.currentTime = 0;
    this.holdTime = null;
    this.playbackSpeed = 1;
    this.delayState = {
      done: false,
      value: void 0
    };
    this.stop = () => {
      const { motionValue: motionValue2 } = this.options;
      if (motionValue2 && motionValue2.updatedAt !== time.now()) {
        this.tick(time.now());
      }
      this.isStopped = true;
      if (this.state === "idle")
        return;
      this.teardown();
      this.options.onStop?.();
    };
    this.options = options;
    this.initAnimation();
    this.play();
    if (options.autoplay === false)
      this.pause();
  }
  initAnimation() {
    const { options } = this;
    replaceTransitionType(options);
    const { type = keyframes, repeat = 0, repeatDelay = 0, repeatType, velocity = 0 } = options;
    let { keyframes: keyframes$1 } = options;
    const generatorFactory = type || keyframes;
    if (process.env.NODE_ENV !== "production" && generatorFactory !== keyframes) {
      invariant(keyframes$1.length <= 2, `Only two keyframes currently supported with spring and inertia animations. Trying to animate ${keyframes$1}`, "spring-two-frames");
    }
    if (generatorFactory !== keyframes && typeof keyframes$1[0] !== "number") {
      this.mixKeyframes = pipe(percentToProgress, mix(keyframes$1[0], keyframes$1[1]));
      keyframes$1 = [0, 100];
    }
    const generator = generatorFactory({ ...options, keyframes: keyframes$1 });
    if (repeatType === "mirror") {
      this.mirroredGenerator = generatorFactory({
        ...options,
        keyframes: [...keyframes$1].reverse(),
        velocity: -velocity
      });
    }
    if (generator.calculatedDuration === null) {
      generator.calculatedDuration = calcGeneratorDuration(generator);
    }
    const { calculatedDuration } = generator;
    this.calculatedDuration = calculatedDuration;
    this.resolvedDuration = calculatedDuration + repeatDelay;
    this.totalDuration = this.resolvedDuration * (repeat + 1) - repeatDelay;
    this.generator = generator;
  }
  updateTime(timestamp) {
    const animationTime = Math.round(timestamp - this.startTime) * this.playbackSpeed;
    if (this.holdTime !== null) {
      this.currentTime = this.holdTime;
    } else {
      this.currentTime = animationTime;
    }
  }
  tick(timestamp, sample = false) {
    const { generator, totalDuration, mixKeyframes, mirroredGenerator, resolvedDuration, calculatedDuration } = this;
    if (this.startTime === null)
      return generator.next(0);
    const { delay: delay2 = 0, keyframes: keyframes2, repeat, repeatType, repeatDelay, type, onUpdate, finalKeyframe } = this.options;
    if (this.speed > 0) {
      this.startTime = Math.min(this.startTime, timestamp);
    } else if (this.speed < 0) {
      this.startTime = Math.min(timestamp - totalDuration / this.speed, this.startTime);
    }
    if (sample) {
      this.currentTime = timestamp;
    } else {
      this.updateTime(timestamp);
    }
    const timeWithoutDelay = this.currentTime - delay2 * (this.playbackSpeed >= 0 ? 1 : -1);
    const isInDelayPhase = this.playbackSpeed >= 0 ? timeWithoutDelay < 0 : timeWithoutDelay > totalDuration;
    this.currentTime = Math.max(timeWithoutDelay, 0);
    if (this.state === "finished" && this.holdTime === null) {
      this.currentTime = totalDuration;
    }
    let elapsed = this.currentTime;
    let frameGenerator = generator;
    if (repeat) {
      const progress2 = Math.min(this.currentTime, totalDuration) / resolvedDuration;
      let currentIteration = Math.floor(progress2);
      let iterationProgress = progress2 % 1;
      if (!iterationProgress && progress2 >= 1) {
        iterationProgress = 1;
      }
      iterationProgress === 1 && currentIteration--;
      currentIteration = Math.min(currentIteration, repeat + 1);
      const isOddIteration = Boolean(currentIteration % 2);
      if (isOddIteration) {
        if (repeatType === "reverse") {
          iterationProgress = 1 - iterationProgress;
          if (repeatDelay) {
            iterationProgress -= repeatDelay / resolvedDuration;
          }
        } else if (repeatType === "mirror") {
          frameGenerator = mirroredGenerator;
        }
      }
      elapsed = clamp(0, 1, iterationProgress) * resolvedDuration;
    }
    let state;
    if (isInDelayPhase) {
      this.delayState.value = keyframes2[0];
      state = this.delayState;
    } else {
      state = frameGenerator.next(elapsed);
    }
    if (mixKeyframes && !isInDelayPhase) {
      state.value = mixKeyframes(state.value);
    }
    let { done } = state;
    if (!isInDelayPhase && calculatedDuration !== null) {
      done = this.playbackSpeed >= 0 ? this.currentTime >= totalDuration : this.currentTime <= 0;
    }
    const isAnimationFinished = this.holdTime === null && (this.state === "finished" || this.state === "running" && done);
    if (isAnimationFinished && type !== inertia) {
      state.value = getFinalKeyframe(keyframes2, this.options, finalKeyframe, this.speed);
    }
    if (onUpdate) {
      onUpdate(state.value);
    }
    if (isAnimationFinished) {
      this.finish();
    }
    return state;
  }
  /**
   * Allows the returned animation to be awaited or promise-chained. Currently
   * resolves when the animation finishes at all but in a future update could/should
   * reject if its cancels.
   */
  then(resolve, reject) {
    return this.finished.then(resolve, reject);
  }
  get duration() {
    return millisecondsToSeconds(this.calculatedDuration);
  }
  get iterationDuration() {
    const { delay: delay2 = 0 } = this.options || {};
    return this.duration + millisecondsToSeconds(delay2);
  }
  get time() {
    return millisecondsToSeconds(this.currentTime);
  }
  set time(newTime) {
    newTime = secondsToMilliseconds(newTime);
    this.currentTime = newTime;
    if (this.startTime === null || this.holdTime !== null || this.playbackSpeed === 0) {
      this.holdTime = newTime;
    } else if (this.driver) {
      this.startTime = this.driver.now() - newTime / this.playbackSpeed;
    }
    if (this.driver) {
      this.driver.start(false);
    } else {
      this.startTime = 0;
      this.state = "paused";
      this.holdTime = newTime;
      this.tick(newTime);
    }
  }
  /**
   * Returns the generator's velocity at the current time in units/second.
   * Uses the analytical derivative when available (springs), avoiding
   * the MotionValue's frame-dependent velocity estimation.
   */
  getGeneratorVelocity() {
    const t = this.currentTime;
    if (t <= 0)
      return this.options.velocity || 0;
    if (this.generator.velocity) {
      return this.generator.velocity(t);
    }
    const current = this.generator.next(t).value;
    return getGeneratorVelocity((s) => this.generator.next(s).value, t, current);
  }
  get speed() {
    return this.playbackSpeed;
  }
  set speed(newSpeed) {
    const hasChanged = this.playbackSpeed !== newSpeed;
    if (hasChanged && this.driver) {
      this.updateTime(time.now());
    }
    this.playbackSpeed = newSpeed;
    if (hasChanged && this.driver) {
      this.time = millisecondsToSeconds(this.currentTime);
    }
  }
  play() {
    if (this.isStopped)
      return;
    const { driver = frameloopDriver, startTime } = this.options;
    if (!this.driver) {
      this.driver = driver((timestamp) => this.tick(timestamp));
    }
    this.options.onPlay?.();
    const now2 = this.driver.now();
    if (this.state === "finished") {
      this.updateFinished();
      this.startTime = now2;
    } else if (this.holdTime !== null) {
      this.startTime = now2 - this.holdTime;
    } else if (!this.startTime) {
      this.startTime = startTime ?? now2;
    }
    if (this.state === "finished" && this.speed < 0) {
      this.startTime += this.calculatedDuration;
    }
    this.holdTime = null;
    this.state = "running";
    this.driver.start();
  }
  pause() {
    this.state = "paused";
    this.updateTime(time.now());
    this.holdTime = this.currentTime;
  }
  complete() {
    if (this.state !== "running") {
      this.play();
    }
    this.state = "finished";
    this.holdTime = null;
  }
  finish() {
    this.notifyFinished();
    this.teardown();
    this.state = "finished";
    this.options.onComplete?.();
  }
  cancel() {
    this.holdTime = null;
    this.startTime = 0;
    this.tick(0);
    this.teardown();
    this.options.onCancel?.();
  }
  teardown() {
    this.state = "idle";
    this.stopDriver();
    this.startTime = this.holdTime = null;
  }
  stopDriver() {
    if (!this.driver)
      return;
    this.driver.stop();
    this.driver = void 0;
  }
  sample(sampleTime) {
    this.startTime = 0;
    return this.tick(sampleTime, true);
  }
  attachTimeline(timeline) {
    if (this.options.allowFlatten) {
      this.options.type = "keyframes";
      this.options.ease = "linear";
      this.initAnimation();
    }
    this.driver?.stop();
    return timeline.observe(this);
  }
};

// node_modules/motion-dom/dist/es/animation/keyframes/utils/fill-wildcards.mjs
function fillWildcards(keyframes2) {
  for (let i = 1; i < keyframes2.length; i++) {
    keyframes2[i] ?? (keyframes2[i] = keyframes2[i - 1]);
  }
}

// node_modules/motion-dom/dist/es/render/dom/parse-transform.mjs
var radToDeg = (rad) => rad * 180 / Math.PI;
var rotate = (v) => {
  const angle = radToDeg(Math.atan2(v[1], v[0]));
  return rebaseAngle(angle);
};
var matrix2dParsers = {
  x: 4,
  y: 5,
  translateX: 4,
  translateY: 5,
  scaleX: 0,
  scaleY: 3,
  scale: (v) => (Math.abs(v[0]) + Math.abs(v[3])) / 2,
  rotate,
  rotateZ: rotate,
  skewX: (v) => radToDeg(Math.atan(v[1])),
  skewY: (v) => radToDeg(Math.atan(v[2])),
  skew: (v) => (Math.abs(v[1]) + Math.abs(v[2])) / 2
};
var rebaseAngle = (angle) => {
  angle = angle % 360;
  if (angle < 0)
    angle += 360;
  return angle;
};
var rotateZ = rotate;
var scaleX = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1]);
var scaleY = (v) => Math.sqrt(v[4] * v[4] + v[5] * v[5]);
var matrix3dParsers = {
  x: 12,
  y: 13,
  z: 14,
  translateX: 12,
  translateY: 13,
  translateZ: 14,
  scaleX,
  scaleY,
  scale: (v) => (scaleX(v) + scaleY(v)) / 2,
  rotateX: (v) => rebaseAngle(radToDeg(Math.atan2(v[6], v[5]))),
  rotateY: (v) => rebaseAngle(radToDeg(Math.atan2(-v[2], v[0]))),
  rotateZ,
  rotate: rotateZ,
  skewX: (v) => radToDeg(Math.atan(v[4])),
  skewY: (v) => radToDeg(Math.atan(v[1])),
  skew: (v) => (Math.abs(v[1]) + Math.abs(v[4])) / 2
};
function defaultTransformValue(name) {
  return name.includes("scale") ? 1 : 0;
}
function parseValueFromTransform(transform, name) {
  if (!transform || transform === "none") {
    return defaultTransformValue(name);
  }
  const matrix3dMatch = transform.match(/^matrix3d\(([-\d.e\s,]+)\)$/u);
  let parsers;
  let match;
  if (matrix3dMatch) {
    parsers = matrix3dParsers;
    match = matrix3dMatch;
  } else {
    const matrix2dMatch = transform.match(/^matrix\(([-\d.e\s,]+)\)$/u);
    parsers = matrix2dParsers;
    match = matrix2dMatch;
  }
  if (!match) {
    return defaultTransformValue(name);
  }
  const valueParser = parsers[name];
  const values = match[1].split(",").map(convertTransformToNumber);
  return typeof valueParser === "function" ? valueParser(values) : values[valueParser];
}
var readTransformValue = (instance, name) => {
  const { transform = "none" } = getComputedStyle(instance);
  return parseValueFromTransform(transform, name);
};
function convertTransformToNumber(value) {
  return parseFloat(value.trim());
}

// node_modules/motion-dom/dist/es/render/utils/keys-transform.mjs
var transformPropOrder = [
  "transformPerspective",
  "x",
  "y",
  "z",
  "translateX",
  "translateY",
  "translateZ",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skew",
  "skewX",
  "skewY"
];
var transformProps = /* @__PURE__ */ (() => /* @__PURE__ */ new Set([...transformPropOrder, "pathRotation"]))();

// node_modules/motion-dom/dist/es/animation/keyframes/utils/unit-conversion.mjs
var isNumOrPxType = (v) => v === number || v === px;
var transformKeys = /* @__PURE__ */ new Set(["x", "y", "z"]);
var nonTranslationalTransformKeys = transformPropOrder.filter((key) => !transformKeys.has(key));
function removeNonTranslationalTransform(visualElement) {
  const removedTransforms = [];
  nonTranslationalTransformKeys.forEach((key) => {
    const value = visualElement.getValue(key);
    if (value !== void 0) {
      removedTransforms.push([key, value.get()]);
      value.set(key.startsWith("scale") ? 1 : 0);
    }
  });
  return removedTransforms;
}
var positionalValues = {
  // Dimensions
  width: ({ x }, { paddingLeft = "0", paddingRight = "0", boxSizing }) => {
    const width = x.max - x.min;
    return boxSizing === "border-box" ? width : width - parseFloat(paddingLeft) - parseFloat(paddingRight);
  },
  height: ({ y }, { paddingTop = "0", paddingBottom = "0", boxSizing }) => {
    const height = y.max - y.min;
    return boxSizing === "border-box" ? height : height - parseFloat(paddingTop) - parseFloat(paddingBottom);
  },
  top: (_bbox, { top }) => parseFloat(top),
  left: (_bbox, { left }) => parseFloat(left),
  bottom: ({ y }, { top }) => parseFloat(top) + (y.max - y.min),
  right: ({ x }, { left }) => parseFloat(left) + (x.max - x.min),
  // Transform
  x: (_bbox, { transform }) => parseValueFromTransform(transform, "x"),
  y: (_bbox, { transform }) => parseValueFromTransform(transform, "y")
};
positionalValues.translateX = positionalValues.x;
positionalValues.translateY = positionalValues.y;

// node_modules/motion-dom/dist/es/animation/keyframes/KeyframesResolver.mjs
var toResolve = /* @__PURE__ */ new Set();
var isScheduled = false;
var anyNeedsMeasurement = false;
var isForced = false;
function measureAllKeyframes() {
  if (anyNeedsMeasurement) {
    const resolversToMeasure = Array.from(toResolve).filter((resolver) => resolver.needsMeasurement);
    const elementsToMeasure = new Set(resolversToMeasure.map((resolver) => resolver.element));
    const transformsToRestore = /* @__PURE__ */ new Map();
    elementsToMeasure.forEach((element) => {
      const removedTransforms = removeNonTranslationalTransform(element);
      if (!removedTransforms.length)
        return;
      transformsToRestore.set(element, removedTransforms);
      element.render();
    });
    resolversToMeasure.forEach((resolver) => resolver.measureInitialState());
    elementsToMeasure.forEach((element) => {
      element.render();
      const restore = transformsToRestore.get(element);
      if (restore) {
        restore.forEach(([key, value]) => {
          element.getValue(key)?.set(value);
        });
      }
    });
    resolversToMeasure.forEach((resolver) => resolver.measureEndState());
    resolversToMeasure.forEach((resolver) => {
      if (resolver.suspendedScrollY !== void 0) {
        window.scrollTo(0, resolver.suspendedScrollY);
      }
    });
  }
  anyNeedsMeasurement = false;
  isScheduled = false;
  toResolve.forEach((resolver) => resolver.complete(isForced));
  toResolve.clear();
}
function readAllKeyframes() {
  toResolve.forEach((resolver) => {
    resolver.readKeyframes();
    if (resolver.needsMeasurement) {
      anyNeedsMeasurement = true;
    }
  });
}
function flushKeyframeResolvers() {
  isForced = true;
  readAllKeyframes();
  measureAllKeyframes();
  isForced = false;
}
var KeyframeResolver = class {
  constructor(unresolvedKeyframes, onComplete, name, motionValue2, element, isAsync = false) {
    this.state = "pending";
    this.isAsync = false;
    this.needsMeasurement = false;
    this.unresolvedKeyframes = [...unresolvedKeyframes];
    this.onComplete = onComplete;
    this.name = name;
    this.motionValue = motionValue2;
    this.element = element;
    this.isAsync = isAsync;
  }
  scheduleResolve() {
    this.state = "scheduled";
    if (this.isAsync) {
      toResolve.add(this);
      if (!isScheduled) {
        isScheduled = true;
        frame.read(readAllKeyframes);
        frame.resolveKeyframes(measureAllKeyframes);
      }
    } else {
      this.readKeyframes();
      this.complete();
    }
  }
  readKeyframes() {
    const { unresolvedKeyframes, name, element, motionValue: motionValue2 } = this;
    if (unresolvedKeyframes[0] === null) {
      const currentValue = motionValue2?.get();
      const finalKeyframe = unresolvedKeyframes[unresolvedKeyframes.length - 1];
      if (currentValue !== void 0) {
        unresolvedKeyframes[0] = currentValue;
      } else if (element && name) {
        const valueAsRead = element.readValue(name, finalKeyframe);
        if (valueAsRead !== void 0 && valueAsRead !== null) {
          unresolvedKeyframes[0] = valueAsRead;
        }
      }
      if (unresolvedKeyframes[0] === void 0) {
        unresolvedKeyframes[0] = finalKeyframe;
      }
      if (motionValue2 && currentValue === void 0) {
        motionValue2.set(unresolvedKeyframes[0]);
      }
    }
    fillWildcards(unresolvedKeyframes);
  }
  setFinalKeyframe() {
  }
  measureInitialState() {
  }
  renderEndStyles() {
  }
  measureEndState() {
  }
  complete(isForcedComplete = false) {
    this.state = "complete";
    this.onComplete(this.unresolvedKeyframes, this.finalKeyframe, isForcedComplete);
    toResolve.delete(this);
  }
  cancel() {
    if (this.state === "scheduled") {
      toResolve.delete(this);
      this.state = "pending";
    }
  }
  resume() {
    if (this.state === "pending")
      this.scheduleResolve();
  }
};

// node_modules/motion-dom/dist/es/render/dom/is-css-var.mjs
var isCSSVar = (name) => name.startsWith("--");

// node_modules/motion-dom/dist/es/render/dom/style-set.mjs
function setStyle(element, name, value) {
  isCSSVar(name) ? element.style.setProperty(name, value) : element.style[name] = value;
}

// node_modules/motion-dom/dist/es/utils/supports/flags.mjs
var supportsFlags = {};

// node_modules/motion-dom/dist/es/utils/supports/memo.mjs
function memoSupports(callback, supportsFlag) {
  const memoized = memo(callback);
  return () => supportsFlags[supportsFlag] ?? memoized();
}

// node_modules/motion-dom/dist/es/utils/supports/scroll-timeline.mjs
var supportsScrollTimeline = /* @__PURE__ */ memoSupports(() => window.ScrollTimeline !== void 0, "scrollTimeline");

// node_modules/motion-dom/dist/es/utils/supports/linear-easing.mjs
var supportsLinearEasing = /* @__PURE__ */ memoSupports(() => {
  try {
    document.createElement("div").animate({ opacity: 0 }, { easing: "linear(0, 1)" });
  } catch (e) {
    return false;
  }
  return true;
}, "linearEasing");

// node_modules/motion-dom/dist/es/animation/waapi/easing/cubic-bezier.mjs
var cubicBezierAsString = ([a, b, c, d]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;

// node_modules/motion-dom/dist/es/animation/waapi/easing/supported.mjs
var supportedWaapiEasing = {
  linear: "linear",
  ease: "ease",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",
  circIn: /* @__PURE__ */ cubicBezierAsString([0, 0.65, 0.55, 1]),
  circOut: /* @__PURE__ */ cubicBezierAsString([0.55, 0, 1, 0.45]),
  backIn: /* @__PURE__ */ cubicBezierAsString([0.31, 0.01, 0.66, -0.59]),
  backOut: /* @__PURE__ */ cubicBezierAsString([0.33, 1.53, 0.69, 0.99])
};

// node_modules/motion-dom/dist/es/animation/waapi/easing/map-easing.mjs
function mapEasingToNativeEasing(easing, duration) {
  if (!easing) {
    return void 0;
  } else if (typeof easing === "function") {
    return supportsLinearEasing() ? generateLinearEasing(easing, duration) : "ease-out";
  } else if (isBezierDefinition(easing)) {
    return cubicBezierAsString(easing);
  } else if (Array.isArray(easing)) {
    return easing.map((segmentEasing) => mapEasingToNativeEasing(segmentEasing, duration) || supportedWaapiEasing.easeOut);
  } else {
    return supportedWaapiEasing[easing];
  }
}

// node_modules/motion-dom/dist/es/animation/waapi/start-waapi-animation.mjs
function startWaapiAnimation(element, valueName, keyframes2, { delay: delay2 = 0, duration = 300, repeat = 0, repeatType = "loop", ease: ease2 = "easeOut", times } = {}, pseudoElement = void 0) {
  const keyframeOptions = {
    [valueName]: keyframes2
  };
  if (times)
    keyframeOptions.offset = times;
  const easing = mapEasingToNativeEasing(ease2, duration);
  if (Array.isArray(easing))
    keyframeOptions.easing = easing;
  const options = {
    delay: delay2,
    duration,
    easing: !Array.isArray(easing) ? easing : "linear",
    fill: "both",
    iterations: repeat + 1,
    direction: repeatType === "reverse" ? "alternate" : "normal"
  };
  if (pseudoElement)
    options.pseudoElement = pseudoElement;
  return element.animate(keyframeOptions, options);
}

// node_modules/motion-dom/dist/es/animation/generators/utils/is-generator.mjs
function isGenerator(type) {
  return typeof type === "function" && "applyToOptions" in type;
}

// node_modules/motion-dom/dist/es/animation/waapi/utils/apply-generator.mjs
function applyGeneratorOptions({ type, ...options }) {
  if (isGenerator(type) && supportsLinearEasing()) {
    return type.applyToOptions(options);
  } else {
    options.duration ?? (options.duration = 300);
    options.ease ?? (options.ease = "easeOut");
  }
  return options;
}

// node_modules/motion-dom/dist/es/animation/NativeAnimation.mjs
var NativeAnimation = class extends WithPromise {
  constructor(options) {
    super();
    this.finishedTime = null;
    this.isStopped = false;
    this.manualStartTime = null;
    if (!options)
      return;
    const { element, name, keyframes: keyframes2, pseudoElement, allowFlatten = false, finalKeyframe, onComplete } = options;
    this.isPseudoElement = Boolean(pseudoElement);
    this.allowFlatten = allowFlatten;
    this.options = options;
    invariant(typeof options.type !== "string", `Mini animate() doesn't support "type" as a string.`, "mini-spring");
    const transition = applyGeneratorOptions(options);
    this.animation = startWaapiAnimation(element, name, keyframes2, transition, pseudoElement);
    if (transition.autoplay === false) {
      this.animation.pause();
    }
    this.animation.onfinish = () => {
      this.finishedTime = this.time;
      if (!pseudoElement) {
        const keyframe = getFinalKeyframe(keyframes2, this.options, finalKeyframe, this.speed);
        if (this.updateMotionValue) {
          this.updateMotionValue(keyframe);
        }
        setStyle(element, name, keyframe);
        this.animation.cancel();
      }
      onComplete?.();
      this.notifyFinished();
    };
  }
  play() {
    if (this.isStopped)
      return;
    this.manualStartTime = null;
    this.animation.play();
    if (this.state === "finished") {
      this.updateFinished();
    }
  }
  pause() {
    this.animation.pause();
  }
  complete() {
    this.animation.finish?.();
  }
  cancel() {
    try {
      this.animation.cancel();
    } catch (e) {
    }
  }
  stop() {
    if (this.isStopped)
      return;
    this.isStopped = true;
    const { state } = this;
    if (state === "idle" || state === "finished") {
      return;
    }
    if (this.updateMotionValue) {
      this.updateMotionValue();
    } else {
      this.commitStyles();
    }
    if (!this.isPseudoElement)
      this.cancel();
  }
  /**
   * WAAPI doesn't natively have any interruption capabilities.
   *
   * In this method, we commit styles back to the DOM before cancelling
   * the animation.
   *
   * This is designed to be overridden by NativeAnimationExtended, which
   * will create a renderless JS animation and sample it twice to calculate
   * its current value, "previous" value, and therefore allow
   * Motion to also correctly calculate velocity for any subsequent animation
   * while deferring the commit until the next animation frame.
   */
  commitStyles() {
    const element = this.options?.element;
    if (!this.isPseudoElement && element?.isConnected) {
      this.animation.commitStyles?.();
    }
  }
  get duration() {
    const duration = this.animation.effect?.getComputedTiming?.().duration || 0;
    return millisecondsToSeconds(Number(duration));
  }
  get iterationDuration() {
    const { delay: delay2 = 0 } = this.options || {};
    return this.duration + millisecondsToSeconds(delay2);
  }
  get time() {
    return millisecondsToSeconds(Number(this.animation.currentTime) || 0);
  }
  set time(newTime) {
    const wasFinished = this.finishedTime !== null;
    this.manualStartTime = null;
    this.finishedTime = null;
    this.animation.currentTime = secondsToMilliseconds(newTime);
    if (wasFinished) {
      this.animation.pause();
    }
  }
  /**
   * The playback speed of the animation.
   * 1 = normal speed, 2 = double speed, 0.5 = half speed.
   */
  get speed() {
    return this.animation.playbackRate;
  }
  set speed(newSpeed) {
    if (newSpeed < 0)
      this.finishedTime = null;
    this.animation.playbackRate = newSpeed;
  }
  get state() {
    return this.finishedTime !== null ? "finished" : this.animation.playState;
  }
  get startTime() {
    return this.manualStartTime ?? Number(this.animation.startTime);
  }
  set startTime(newStartTime) {
    this.manualStartTime = this.animation.startTime = newStartTime;
  }
  /**
   * Attaches a timeline to the animation, for instance the `ScrollTimeline`.
   */
  attachTimeline({ timeline, rangeStart, rangeEnd, observe }) {
    if (this.allowFlatten) {
      this.animation.effect?.updateTiming({ easing: "linear" });
    }
    this.animation.onfinish = null;
    if (timeline && supportsScrollTimeline()) {
      this.animation.timeline = timeline;
      if (rangeStart)
        this.animation.rangeStart = rangeStart;
      if (rangeEnd)
        this.animation.rangeEnd = rangeEnd;
      return noop;
    } else {
      return observe(this);
    }
  }
};

// node_modules/motion-dom/dist/es/animation/waapi/utils/unsupported-easing.mjs
var unsupportedEasingFunctions = {
  anticipate,
  backInOut,
  circInOut
};
function isUnsupportedEase(key) {
  return key in unsupportedEasingFunctions;
}
function replaceStringEasing(transition) {
  if (typeof transition.ease === "string" && isUnsupportedEase(transition.ease)) {
    transition.ease = unsupportedEasingFunctions[transition.ease];
  }
}

// node_modules/motion-dom/dist/es/animation/NativeAnimationExtended.mjs
var sampleDelta = 10;
var NativeAnimationExtended = class extends NativeAnimation {
  constructor(options) {
    replaceStringEasing(options);
    replaceTransitionType(options);
    super(options);
    if (options.startTime !== void 0 && options.autoplay !== false) {
      this.startTime = options.startTime;
    }
    this.options = options;
  }
  /**
   * WAAPI doesn't natively have any interruption capabilities.
   *
   * Rather than read committed styles back out of the DOM, we can
   * create a renderless JS animation and sample it twice to calculate
   * its current value, "previous" value, and therefore allow
   * Motion to calculate velocity for any subsequent animation.
   */
  updateMotionValue(value) {
    const { motionValue: motionValue2, onUpdate, onComplete, element, ...options } = this.options;
    if (!motionValue2)
      return;
    if (value !== void 0) {
      motionValue2.set(value);
      return;
    }
    const sampleAnimation = new JSAnimation({
      ...options,
      autoplay: false
    });
    const sampleTime = Math.max(sampleDelta, time.now() - this.startTime);
    const delta = clamp(0, sampleDelta, sampleTime - sampleDelta);
    const current = sampleAnimation.sample(sampleTime).value;
    const { name } = this.options;
    if (element && name)
      setStyle(element, name, current);
    motionValue2.setWithVelocity(sampleAnimation.sample(Math.max(0, sampleTime - delta)).value, current, delta);
    sampleAnimation.stop();
  }
};

// node_modules/motion-dom/dist/es/animation/utils/is-animatable.mjs
var isAnimatable = (value, name) => {
  if (name === "zIndex")
    return false;
  if (typeof value === "number" || Array.isArray(value))
    return true;
  if (typeof value === "string" && // It's animatable if we have a string
  (complex.test(value) || value === "0") && // And it contains numbers and/or colors
  !value.startsWith("url(")) {
    return true;
  }
  return false;
};

// node_modules/motion-dom/dist/es/animation/utils/can-animate.mjs
function hasKeyframesChanged(keyframes2) {
  const current = keyframes2[0];
  if (keyframes2.length === 1)
    return true;
  for (let i = 0; i < keyframes2.length; i++) {
    if (keyframes2[i] !== current)
      return true;
  }
}
function canAnimate(keyframes2, name, type, velocity) {
  const originKeyframe = keyframes2[0];
  if (originKeyframe === null) {
    return false;
  }
  if (name === "display" || name === "visibility")
    return true;
  const targetKeyframe = keyframes2[keyframes2.length - 1];
  const isOriginAnimatable = isAnimatable(originKeyframe, name);
  const isTargetAnimatable = isAnimatable(targetKeyframe, name);
  warning(isOriginAnimatable === isTargetAnimatable, `You are trying to animate ${name} from "${originKeyframe}" to "${targetKeyframe}". "${isOriginAnimatable ? targetKeyframe : originKeyframe}" is not an animatable value.`, "value-not-animatable");
  if (!isOriginAnimatable || !isTargetAnimatable) {
    return false;
  }
  return hasKeyframesChanged(keyframes2) || (type === "spring" || isGenerator(type)) && velocity;
}

// node_modules/motion-dom/dist/es/animation/utils/make-animation-instant.mjs
function makeAnimationInstant(options) {
  options.duration = 0;
  options.type = "keyframes";
}

// node_modules/motion-dom/dist/es/animation/waapi/utils/accelerated-values.mjs
var acceleratedValues = /* @__PURE__ */ new Set([
  "opacity",
  "clipPath",
  "filter",
  "transform",
  "backgroundColor"
]);

// node_modules/motion-dom/dist/es/animation/waapi/utils/is-browser-color.mjs
var browserColorFunctions = /^(?:oklch|oklab|lab|lch|color|color-mix|light-dark)\(/;
function hasBrowserOnlyColors(keyframes2) {
  for (let i = 0; i < keyframes2.length; i++) {
    if (typeof keyframes2[i] === "string" && browserColorFunctions.test(keyframes2[i])) {
      return true;
    }
  }
  return false;
}

// node_modules/motion-dom/dist/es/animation/waapi/supports/waapi.mjs
var colorProperties = /* @__PURE__ */ new Set([
  "color",
  "backgroundColor",
  "outlineColor",
  "fill",
  "stroke",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor"
]);
var supportsWaapi = /* @__PURE__ */ memo(() => Object.hasOwnProperty.call(Element.prototype, "animate"));
function supportsBrowserAnimation(options) {
  const { motionValue: motionValue2, name, repeatDelay, repeatType, damping, type, keyframes: keyframes2 } = options;
  const subject = motionValue2?.owner?.current;
  if (!(subject instanceof HTMLElement) && !(subject instanceof SVGElement)) {
    return false;
  }
  const { onUpdate, transformTemplate } = motionValue2.owner.getProps();
  return supportsWaapi() && name && /**
   * Force WAAPI for color properties with browser-only color formats
   * (oklch, oklab, lab, lch, etc.) that the JS animation path can't parse.
   */
  (acceleratedValues.has(name) || colorProperties.has(name) && hasBrowserOnlyColors(keyframes2)) && (name !== "transform" || !transformTemplate) && /**
   * If we're outputting values to onUpdate then we can't use WAAPI as there's
   * no way to read the value from WAAPI every frame.
   */
  !onUpdate && !repeatDelay && repeatType !== "mirror" && damping !== 0 && type !== "inertia";
}

// node_modules/motion-dom/dist/es/animation/AsyncMotionValueAnimation.mjs
var MAX_RESOLVE_DELAY = 40;
var AsyncMotionValueAnimation = class extends WithPromise {
  constructor({ autoplay = true, delay: delay2 = 0, type = "keyframes", repeat = 0, repeatDelay = 0, repeatType = "loop", keyframes: keyframes2, name, motionValue: motionValue2, element, ...options }) {
    super();
    this.stop = () => {
      if (this._animation) {
        this._animation.stop();
        this.stopTimeline?.();
      }
      this.keyframeResolver?.cancel();
    };
    this.createdAt = time.now();
    const optionsWithDefaults = {
      autoplay,
      delay: delay2,
      type,
      repeat,
      repeatDelay,
      repeatType,
      name,
      motionValue: motionValue2,
      element,
      ...options
    };
    const KeyframeResolver$1 = element?.KeyframeResolver || KeyframeResolver;
    this.keyframeResolver = new KeyframeResolver$1(keyframes2, (resolvedKeyframes, finalKeyframe, forced) => this.onKeyframesResolved(resolvedKeyframes, finalKeyframe, optionsWithDefaults, !forced), name, motionValue2, element);
    this.keyframeResolver?.scheduleResolve();
  }
  onKeyframesResolved(keyframes2, finalKeyframe, options, sync) {
    this.keyframeResolver = void 0;
    const { name, type, velocity, delay: delay2, isHandoff, onUpdate } = options;
    this.resolvedAt = time.now();
    let canAnimateValue = true;
    if (!canAnimate(keyframes2, name, type, velocity)) {
      canAnimateValue = false;
      if (MotionGlobalConfig.instantAnimations || !delay2) {
        onUpdate?.(getFinalKeyframe(keyframes2, options, finalKeyframe));
      }
      keyframes2[0] = keyframes2[keyframes2.length - 1];
      makeAnimationInstant(options);
      options.repeat = 0;
    }
    const startTime = sync ? !this.resolvedAt ? this.createdAt : this.resolvedAt - this.createdAt > MAX_RESOLVE_DELAY ? this.resolvedAt : this.createdAt : void 0;
    const resolvedOptions = {
      startTime,
      finalKeyframe,
      ...options,
      keyframes: keyframes2
    };
    const useWaapi = canAnimateValue && !isHandoff && supportsBrowserAnimation(resolvedOptions);
    const element = resolvedOptions.motionValue?.owner?.current;
    let animation;
    if (useWaapi) {
      try {
        animation = new NativeAnimationExtended({
          ...resolvedOptions,
          element
        });
      } catch {
        animation = new JSAnimation(resolvedOptions);
      }
    } else {
      animation = new JSAnimation(resolvedOptions);
    }
    animation.finished.then(() => {
      this.notifyFinished();
    }).catch(noop);
    if (this.pendingTimeline) {
      this.stopTimeline = animation.attachTimeline(this.pendingTimeline);
      this.pendingTimeline = void 0;
    }
    this._animation = animation;
  }
  get finished() {
    if (!this._animation) {
      return this._finished;
    } else {
      return this.animation.finished;
    }
  }
  then(onResolve, _onReject) {
    return this.finished.finally(onResolve).then(() => {
    });
  }
  get animation() {
    if (!this._animation) {
      this.keyframeResolver?.resume();
      flushKeyframeResolvers();
    }
    return this._animation;
  }
  get duration() {
    return this.animation.duration;
  }
  get iterationDuration() {
    return this.animation.iterationDuration;
  }
  get time() {
    return this.animation.time;
  }
  set time(newTime) {
    this.animation.time = newTime;
  }
  get speed() {
    return this.animation.speed;
  }
  get state() {
    return this.animation.state;
  }
  set speed(newSpeed) {
    this.animation.speed = newSpeed;
  }
  get startTime() {
    return this.animation.startTime;
  }
  attachTimeline(timeline) {
    if (this._animation) {
      this.stopTimeline = this.animation.attachTimeline(timeline);
    } else {
      this.pendingTimeline = timeline;
    }
    return () => this.stop();
  }
  play() {
    this.animation.play();
  }
  pause() {
    this.animation.pause();
  }
  complete() {
    this.animation.complete();
  }
  cancel() {
    if (this._animation) {
      this.animation.cancel();
    }
    this.keyframeResolver?.cancel();
  }
};

// node_modules/motion-dom/dist/es/animation/utils/calc-child-stagger.mjs
function calcChildStagger(children, child, delayChildren, staggerChildren = 0, staggerDirection = 1) {
  const index = Array.from(children).sort((a, b) => a.sortNodePosition(b)).indexOf(child);
  const numChildren = children.size;
  const maxStaggerDuration = (numChildren - 1) * staggerChildren;
  const delayIsFunction = typeof delayChildren === "function";
  return delayIsFunction ? delayChildren(index, numChildren) : staggerDirection === 1 ? index * staggerChildren : maxStaggerDuration - index * staggerChildren;
}

// node_modules/motion-dom/dist/es/value/index.mjs
var MAX_VELOCITY_DELTA = 30;
var isFloat = (value) => {
  return !isNaN(parseFloat(value));
};
var collectMotionValues = {
  current: void 0
};
var MotionValue = class {
  /**
   * @param init - The initiating value
   * @param config - Optional configuration options
   *
   * -  `transformer`: A function to transform incoming values with.
   */
  constructor(init, options = {}) {
    this.canTrackVelocity = null;
    this.events = {};
    this.updateAndNotify = (v) => {
      const currentTime = time.now();
      if (this.updatedAt !== currentTime) {
        this.setPrevFrameValue();
      }
      this.prev = this.current;
      this.setCurrent(v);
      if (this.current !== this.prev) {
        this.events.change?.notify(this.current);
        if (this.dependents) {
          for (const dependent of this.dependents) {
            dependent.dirty();
          }
        }
      }
    };
    this.hasAnimated = false;
    this.setCurrent(init);
    this.owner = options.owner;
  }
  setCurrent(current) {
    this.current = current;
    this.updatedAt = time.now();
    if (this.canTrackVelocity === null && current !== void 0) {
      this.canTrackVelocity = isFloat(this.current);
    }
  }
  setPrevFrameValue(prevFrameValue = this.current) {
    this.prevFrameValue = prevFrameValue;
    this.prevUpdatedAt = this.updatedAt;
  }
  /**
   * Adds a function that will be notified when the `MotionValue` is updated.
   *
   * It returns a function that, when called, will cancel the subscription.
   *
   * When calling `onChange` inside a React component, it should be wrapped with the
   * `useEffect` hook. As it returns an unsubscribe function, this should be returned
   * from the `useEffect` function to ensure you don't add duplicate subscribers..
   *
   * ```jsx
   * export const MyComponent = () => {
   *   const x = useMotionValue(0)
   *   const y = useMotionValue(0)
   *   const opacity = useMotionValue(1)
   *
   *   useEffect(() => {
   *     function updateOpacity() {
   *       const maxXY = Math.max(x.get(), y.get())
   *       const newOpacity = transform(maxXY, [0, 100], [1, 0])
   *       opacity.set(newOpacity)
   *     }
   *
   *     const unsubscribeX = x.on("change", updateOpacity)
   *     const unsubscribeY = y.on("change", updateOpacity)
   *
   *     return () => {
   *       unsubscribeX()
   *       unsubscribeY()
   *     }
   *   }, [])
   *
   *   return <motion.div style={{ x }} />
   * }
   * ```
   *
   * @param subscriber - A function that receives the latest value.
   * @returns A function that, when called, will cancel this subscription.
   *
   * @deprecated
   */
  onChange(subscription) {
    if (process.env.NODE_ENV !== "production") {
      warnOnce(false, `value.onChange(callback) is deprecated. Switch to value.on("change", callback).`);
    }
    return this.on("change", subscription);
  }
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = new SubscriptionManager();
    }
    const unsubscribe = this.events[eventName].add(callback);
    if (eventName === "change") {
      return () => {
        unsubscribe();
        frame.read(() => {
          if (!this.events.change.getSize()) {
            this.stop();
          }
        });
      };
    }
    return unsubscribe;
  }
  clearListeners() {
    for (const eventManagers in this.events) {
      this.events[eventManagers].clear();
    }
  }
  /**
   * Attaches a passive effect to the `MotionValue`.
   */
  attach(passiveEffect, stopPassiveEffect) {
    this.passiveEffect = passiveEffect;
    this.stopPassiveEffect = stopPassiveEffect;
  }
  /**
   * Sets the state of the `MotionValue`.
   *
   * @remarks
   *
   * ```jsx
   * const x = useMotionValue(0)
   * x.set(10)
   * ```
   *
   * @param latest - Latest value to set.
   * @param render - Whether to notify render subscribers. Defaults to `true`
   *
   * @public
   */
  set(v) {
    if (!this.passiveEffect) {
      this.updateAndNotify(v);
    } else {
      this.passiveEffect(v, this.updateAndNotify);
    }
  }
  setWithVelocity(prev, current, delta) {
    this.set(current);
    this.prev = void 0;
    this.prevFrameValue = prev;
    this.prevUpdatedAt = this.updatedAt - delta;
  }
  /**
   * Set the state of the `MotionValue`, stopping any active animations,
   * effects, and resets velocity to `0`.
   */
  jump(v, endAnimation = true) {
    this.updateAndNotify(v);
    this.prev = v;
    this.prevUpdatedAt = this.prevFrameValue = void 0;
    endAnimation && this.stop();
    if (this.stopPassiveEffect)
      this.stopPassiveEffect();
  }
  dirty() {
    this.events.change?.notify(this.current);
  }
  addDependent(dependent) {
    if (!this.dependents) {
      this.dependents = /* @__PURE__ */ new Set();
    }
    this.dependents.add(dependent);
  }
  removeDependent(dependent) {
    if (this.dependents) {
      this.dependents.delete(dependent);
    }
  }
  /**
   * Returns the latest state of `MotionValue`
   *
   * @returns - The latest state of `MotionValue`
   *
   * @public
   */
  get() {
    if (collectMotionValues.current) {
      collectMotionValues.current.push(this);
    }
    return this.current;
  }
  /**
   * @public
   */
  getPrevious() {
    return this.prev;
  }
  /**
   * Returns the latest velocity of `MotionValue`
   *
   * @returns - The latest velocity of `MotionValue`. Returns `0` if the state is non-numerical.
   *
   * @public
   */
  getVelocity() {
    const currentTime = time.now();
    if (!this.canTrackVelocity || this.prevFrameValue === void 0 || currentTime - this.updatedAt > MAX_VELOCITY_DELTA) {
      return 0;
    }
    const delta = Math.min(this.updatedAt - this.prevUpdatedAt, MAX_VELOCITY_DELTA);
    return velocityPerSecond(parseFloat(this.current) - parseFloat(this.prevFrameValue), delta);
  }
  /**
   * Registers a new animation to control this `MotionValue`. Only one
   * animation can drive a `MotionValue` at one time.
   *
   * ```jsx
   * value.start()
   * ```
   *
   * @param animation - A function that starts the provided animation
   */
  start(startAnimation) {
    this.stop();
    return new Promise((resolve) => {
      this.hasAnimated = true;
      this.animation = startAnimation(resolve);
      if (this.events.animationStart) {
        this.events.animationStart.notify();
      }
    }).then(() => {
      if (this.events.animationComplete) {
        this.events.animationComplete.notify();
      }
      this.clearAnimation();
    });
  }
  /**
   * Stop the currently active animation.
   *
   * @public
   */
  stop() {
    if (this.animation) {
      this.animation.stop();
      if (this.events.animationCancel) {
        this.events.animationCancel.notify();
      }
    }
    this.clearAnimation();
  }
  /**
   * Returns `true` if this value is currently animating.
   *
   * @public
   */
  isAnimating() {
    return !!this.animation;
  }
  clearAnimation() {
    delete this.animation;
  }
  /**
   * Destroy and clean up subscribers to this `MotionValue`.
   *
   * The `MotionValue` hooks like `useMotionValue` and `useTransform` automatically
   * handle the lifecycle of the returned `MotionValue`, so this method is only necessary if you've manually
   * created a `MotionValue` via the `motionValue` function.
   *
   * @public
   */
  destroy() {
    this.dependents?.clear();
    this.events.destroy?.notify();
    this.clearListeners();
    this.stop();
    if (this.stopPassiveEffect) {
      this.stopPassiveEffect();
    }
  }
};
function motionValue(init, options) {
  return new MotionValue(init, options);
}

// node_modules/motion-dom/dist/es/animation/utils/resolve-transition.mjs
function resolveTransition(transition, parentTransition) {
  if (transition?.inherit && parentTransition) {
    const { inherit: _, ...rest } = transition;
    return { ...parentTransition, ...rest };
  }
  return transition;
}

// node_modules/motion-dom/dist/es/animation/utils/get-value-transition.mjs
function getValueTransition(transition, key) {
  const valueTransition = transition?.[key] ?? transition?.["default"] ?? transition;
  if (valueTransition !== transition) {
    return resolveTransition(valueTransition, transition);
  }
  return valueTransition;
}

// node_modules/motion-dom/dist/es/animation/utils/default-transitions.mjs
var underDampedSpring = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
};
var criticallyDampedSpring = (target) => ({
  type: "spring",
  stiffness: 550,
  damping: target === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
});
var keyframesTransition = {
  type: "keyframes",
  duration: 0.8
};
var ease = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
};
var getDefaultTransition = (valueKey, { keyframes: keyframes2 }) => {
  if (keyframes2.length > 2) {
    return keyframesTransition;
  } else if (transformProps.has(valueKey)) {
    return valueKey.startsWith("scale") ? criticallyDampedSpring(keyframes2[1]) : underDampedSpring;
  }
  return ease;
};

// node_modules/motion-dom/dist/es/animation/utils/is-transition-defined.mjs
var orchestrationKeys = /* @__PURE__ */ new Set([
  "when",
  "delay",
  "delayChildren",
  "staggerChildren",
  "staggerDirection",
  "repeat",
  "repeatType",
  "repeatDelay",
  "from",
  "elapsed"
]);
function isTransitionDefined(transition) {
  for (const key in transition) {
    if (!orchestrationKeys.has(key))
      return true;
  }
  return false;
}

// node_modules/motion-dom/dist/es/animation/interfaces/motion-value.mjs
var animateMotionValue = (name, value, target, transition = {}, element, isHandoff) => (onComplete) => {
  const valueTransition = getValueTransition(transition, name) || {};
  const delay2 = valueTransition.delay || transition.delay || 0;
  let { elapsed = 0 } = transition;
  elapsed = elapsed - secondsToMilliseconds(delay2);
  const options = {
    keyframes: Array.isArray(target) ? target : [null, target],
    ease: "easeOut",
    velocity: value.getVelocity(),
    ...valueTransition,
    delay: -elapsed,
    onUpdate: (v) => {
      value.set(v);
      valueTransition.onUpdate && valueTransition.onUpdate(v);
    },
    onComplete: () => {
      onComplete();
      valueTransition.onComplete && valueTransition.onComplete();
    },
    name,
    motionValue: value,
    element: isHandoff ? void 0 : element
  };
  if (!isTransitionDefined(valueTransition)) {
    Object.assign(options, getDefaultTransition(name, options));
  }
  options.duration && (options.duration = secondsToMilliseconds(options.duration));
  options.repeatDelay && (options.repeatDelay = secondsToMilliseconds(options.repeatDelay));
  if (options.from !== void 0) {
    options.keyframes[0] = options.from;
  }
  let shouldSkip = false;
  if (options.type === false || options.duration === 0 && !options.repeatDelay) {
    makeAnimationInstant(options);
    if (options.delay === 0) {
      shouldSkip = true;
    }
  }
  if (MotionGlobalConfig.instantAnimations || MotionGlobalConfig.skipAnimations || element?.shouldSkipAnimations || valueTransition.skipAnimations) {
    shouldSkip = true;
    makeAnimationInstant(options);
    options.delay = 0;
  }
  options.allowFlatten = !valueTransition.type && !valueTransition.ease;
  if (shouldSkip && !isHandoff && value.get() !== void 0) {
    const finalKeyframe = getFinalKeyframe(options.keyframes, valueTransition);
    if (finalKeyframe !== void 0) {
      frame.update(() => {
        options.onUpdate(finalKeyframe);
        options.onComplete();
      });
      return;
    }
  }
  return valueTransition.isSync ? new JSAnimation(options) : new AsyncMotionValueAnimation(options);
};

// node_modules/motion-dom/dist/es/animation/utils/css-variables-conversion.mjs
var splitCSSVariableRegex = (
  // eslint-disable-next-line redos-detector/no-unsafe-regex -- false positive, as it can match a lot of words
  /^var\(--(?:([\w-]+)|([\w-]+), ?([a-zA-Z\d ()%#.,-]+))\)/u
);
function parseCSSVariable(current) {
  const match = splitCSSVariableRegex.exec(current);
  if (!match)
    return [,];
  const [, token1, token2, fallback] = match;
  return [`--${token1 ?? token2}`, fallback];
}
var maxDepth = 4;
function getVariableValue(current, element, depth = 1) {
  invariant(depth <= maxDepth, `Max CSS variable fallback depth detected in property "${current}". This may indicate a circular fallback dependency.`, "max-css-var-depth");
  const [token, fallback] = parseCSSVariable(current);
  if (!token)
    return;
  const resolved = window.getComputedStyle(element).getPropertyValue(token);
  if (resolved) {
    const trimmed = resolved.trim();
    return isNumericalString(trimmed) ? parseFloat(trimmed) : trimmed;
  }
  return isCSSVariableToken(fallback) ? getVariableValue(fallback, element, depth + 1) : fallback;
}

// node_modules/motion-dom/dist/es/render/utils/resolve-variants.mjs
function getValueState(visualElement) {
  const state = [{}, {}];
  visualElement?.values.forEach((value, key) => {
    state[0][key] = value.get();
    state[1][key] = value.getVelocity();
  });
  return state;
}
function resolveVariantFromProps(props, definition, custom, visualElement) {
  if (typeof definition === "function") {
    const [current, velocity] = getValueState(visualElement);
    definition = definition(custom !== void 0 ? custom : props.custom, current, velocity);
  }
  if (typeof definition === "string") {
    definition = props.variants && props.variants[definition];
  }
  if (typeof definition === "function") {
    const [current, velocity] = getValueState(visualElement);
    definition = definition(custom !== void 0 ? custom : props.custom, current, velocity);
  }
  return definition;
}

// node_modules/motion-dom/dist/es/render/utils/resolve-dynamic-variants.mjs
function resolveVariant(visualElement, definition, custom) {
  const props = visualElement.getProps();
  return resolveVariantFromProps(props, definition, custom !== void 0 ? custom : props.custom, visualElement);
}

// node_modules/motion-dom/dist/es/render/utils/keys-position.mjs
var positionalKeys = /* @__PURE__ */ new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  ...transformPropOrder
]);

// node_modules/motion-dom/dist/es/render/utils/is-keyframes-target.mjs
var isKeyframesTarget = (v) => {
  return Array.isArray(v);
};

// node_modules/motion-dom/dist/es/render/utils/setters.mjs
function setMotionValue(visualElement, key, value) {
  if (visualElement.hasValue(key)) {
    visualElement.getValue(key).set(value);
  } else {
    visualElement.addValue(key, motionValue(value));
  }
}
function resolveFinalValueInKeyframes(v) {
  return isKeyframesTarget(v) ? v[v.length - 1] || 0 : v;
}
function setTarget(visualElement, definition) {
  const resolved = resolveVariant(visualElement, definition);
  let { transitionEnd = {}, transition = {}, ...target } = resolved || {};
  target = { ...target, ...transitionEnd };
  for (const key in target) {
    const value = resolveFinalValueInKeyframes(target[key]);
    setMotionValue(visualElement, key, value);
  }
}

// node_modules/motion-dom/dist/es/value/utils/is-motion-value.mjs
var isMotionValue = (value) => Boolean(value && value.getVelocity);

// node_modules/motion-dom/dist/es/value/will-change/is.mjs
function isWillChangeMotionValue(value) {
  return Boolean(isMotionValue(value) && value.add);
}

// node_modules/motion-dom/dist/es/value/will-change/add-will-change.mjs
function addValueToWillChange(visualElement, key) {
  const willChange = visualElement.getValue("willChange");
  if (isWillChangeMotionValue(willChange)) {
    return willChange.add(key);
  } else if (!willChange && MotionGlobalConfig.WillChange) {
    const newWillChange = new MotionGlobalConfig.WillChange("auto");
    visualElement.addValue("willChange", newWillChange);
    newWillChange.add(key);
  }
}

// node_modules/motion-dom/dist/es/render/dom/utils/camel-to-dash.mjs
function camelToDash(str) {
  return str.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
}

// node_modules/motion-dom/dist/es/animation/optimized-appear/data-id.mjs
var optimizedAppearDataId = "framerAppearId";
var optimizedAppearDataAttribute = "data-" + camelToDash(optimizedAppearDataId);

// node_modules/motion-dom/dist/es/animation/optimized-appear/get-appear-id.mjs
function getOptimisedAppearId(visualElement) {
  return visualElement.props[optimizedAppearDataAttribute];
}

// node_modules/motion-dom/dist/es/animation/interfaces/visual-element-target.mjs
function shouldBlockAnimation({ protectedKeys, needsAnimating }, key) {
  const shouldBlock = protectedKeys.hasOwnProperty(key) && needsAnimating[key] !== true;
  needsAnimating[key] = false;
  return shouldBlock;
}
function animateTarget(visualElement, targetAndTransition, { delay: delay2 = 0, transitionOverride, type } = {}) {
  let { transition, transitionEnd, ...target } = targetAndTransition;
  const defaultTransition = visualElement.getDefaultTransition();
  transition = transition ? resolveTransition(transition, defaultTransition) : defaultTransition;
  const reduceMotion = transition?.reduceMotion;
  const skipAnimations = transition?.skipAnimations;
  if (transitionOverride)
    transition = transitionOverride;
  const animations2 = [];
  const animationTypeState = type && visualElement.animationState && visualElement.animationState.getState()[type];
  const path = transition?.path;
  if (path) {
    path.animateVisualElement(visualElement, target, transition, delay2, animations2);
  }
  for (const key in target) {
    const value = visualElement.getValue(key, visualElement.latestValues[key] ?? null);
    const valueTarget = target[key];
    if (valueTarget === void 0 || animationTypeState && shouldBlockAnimation(animationTypeState, key)) {
      continue;
    }
    const valueTransition = {
      delay: delay2,
      ...getValueTransition(transition || {}, key)
    };
    if (skipAnimations)
      valueTransition.skipAnimations = true;
    const currentValue = value.get();
    if (currentValue !== void 0 && !value.isAnimating() && !Array.isArray(valueTarget) && valueTarget === currentValue && !valueTransition.velocity) {
      frame.update(() => value.set(valueTarget));
      continue;
    }
    let isHandoff = false;
    if (window.MotionHandoffAnimation) {
      const appearId = getOptimisedAppearId(visualElement);
      if (appearId) {
        const startTime = window.MotionHandoffAnimation(appearId, key, frame);
        if (startTime !== null) {
          valueTransition.startTime = startTime;
          isHandoff = true;
        }
      }
    }
    addValueToWillChange(visualElement, key);
    const shouldReduceMotion = reduceMotion ?? visualElement.shouldReduceMotion;
    value.start(animateMotionValue(key, value, valueTarget, shouldReduceMotion && positionalKeys.has(key) ? { type: false } : valueTransition, visualElement, isHandoff));
    const animation = value.animation;
    if (animation) {
      animations2.push(animation);
    }
  }
  if (transitionEnd) {
    const applyTransitionEnd = () => frame.update(() => {
      transitionEnd && setTarget(visualElement, transitionEnd);
    });
    if (animations2.length) {
      Promise.all(animations2).then(applyTransitionEnd);
    } else {
      applyTransitionEnd();
    }
  }
  return animations2;
}

// node_modules/motion-dom/dist/es/animation/interfaces/visual-element-variant.mjs
function animateVariant(visualElement, variant, options = {}) {
  const resolved = resolveVariant(visualElement, variant, options.type === "exit" ? visualElement.presenceContext?.custom : void 0);
  let { transition = visualElement.getDefaultTransition() || {} } = resolved || {};
  if (options.transitionOverride) {
    transition = options.transitionOverride;
  }
  const getAnimation = resolved ? () => Promise.all(animateTarget(visualElement, resolved, options)) : () => Promise.resolve();
  const getChildAnimations = visualElement.variantChildren && visualElement.variantChildren.size ? (forwardDelay = 0) => {
    const { delayChildren = 0, staggerChildren, staggerDirection } = transition;
    return animateChildren(visualElement, variant, forwardDelay, delayChildren, staggerChildren, staggerDirection, options);
  } : () => Promise.resolve();
  const { when: when2 } = transition;
  if (when2) {
    const [first, last] = when2 === "beforeChildren" ? [getAnimation, getChildAnimations] : [getChildAnimations, getAnimation];
    return first().then(() => last());
  } else {
    return Promise.all([getAnimation(), getChildAnimations(options.delay)]);
  }
}
function animateChildren(visualElement, variant, delay2 = 0, delayChildren = 0, staggerChildren = 0, staggerDirection = 1, options) {
  const animations2 = [];
  for (const child of visualElement.variantChildren) {
    child.notify("AnimationStart", variant);
    animations2.push(animateVariant(child, variant, {
      ...options,
      delay: delay2 + (typeof delayChildren === "function" ? 0 : delayChildren) + calcChildStagger(visualElement.variantChildren, child, delayChildren, staggerChildren, staggerDirection)
    }).then(() => child.notify("AnimationComplete", variant)));
  }
  return Promise.all(animations2);
}

// node_modules/motion-dom/dist/es/animation/interfaces/visual-element.mjs
function animateVisualElement(visualElement, definition, options = {}) {
  visualElement.notify("AnimationStart", definition);
  let animation;
  if (Array.isArray(definition)) {
    const animations2 = definition.map((variant) => animateVariant(visualElement, variant, options));
    animation = Promise.all(animations2);
  } else if (typeof definition === "string") {
    animation = animateVariant(visualElement, definition, options);
  } else {
    const resolvedDefinition = typeof definition === "function" ? resolveVariant(visualElement, definition, options.custom) : definition;
    animation = Promise.all(animateTarget(visualElement, resolvedDefinition, options));
  }
  return animation.then(() => {
    visualElement.notify("AnimationComplete", definition);
  });
}

// node_modules/motion-dom/dist/es/value/types/auto.mjs
var auto = {
  test: (v) => v === "auto",
  parse: (v) => v
};

// node_modules/motion-dom/dist/es/value/types/test.mjs
var testValueType = (v) => (type) => type.test(v);

// node_modules/motion-dom/dist/es/value/types/dimensions.mjs
var dimensionValueTypes = [number, px, percent, degrees, vw, vh, auto];
var findDimensionValueType = (v) => dimensionValueTypes.find(testValueType(v));

// node_modules/motion-dom/dist/es/animation/keyframes/utils/is-none.mjs
function isNone(value) {
  if (typeof value === "number") {
    return value === 0;
  } else if (value !== null) {
    return value === "none" || value === "0" || isZeroValueString(value);
  } else {
    return true;
  }
}

// node_modules/motion-dom/dist/es/value/types/complex/filter.mjs
var maxDefaults = /* @__PURE__ */ new Set(["brightness", "contrast", "saturate", "opacity"]);
function applyDefaultFilter(v) {
  const [name, value] = v.slice(0, -1).split("(");
  if (name === "drop-shadow")
    return v;
  const [number2] = value.match(floatRegex) || [];
  if (!number2)
    return v;
  const unit = value.replace(number2, "");
  let defaultValue = maxDefaults.has(name) ? 1 : 0;
  if (number2 !== value)
    defaultValue *= 100;
  return name + "(" + defaultValue + unit + ")";
}
var functionRegex = /\b([a-z-]*)\(.*?\)/gu;
var filter = {
  ...complex,
  getAnimatableNone: (v) => {
    const functions = v.match(functionRegex);
    return functions ? functions.map(applyDefaultFilter).join(" ") : v;
  }
};

// node_modules/motion-dom/dist/es/value/types/complex/mask.mjs
var mask = {
  ...complex,
  getAnimatableNone: (v) => {
    const parsed = complex.parse(v);
    const transformer = complex.createTransformer(v);
    return transformer(parsed.map((v2) => typeof v2 === "number" ? 0 : typeof v2 === "object" ? { ...v2, alpha: 1 } : v2));
  }
};

// node_modules/motion-dom/dist/es/value/types/int.mjs
var int = {
  ...number,
  transform: Math.round
};

// node_modules/motion-dom/dist/es/value/types/maps/transform.mjs
var transformValueTypes = {
  rotate: degrees,
  /**
   * Internal channel for `transition.path` orientToPath. Composed onto
   * `rotate` at the transform-build sites so the user's `rotate` is
   * never read or overwritten. Not part of `transformPropOrder`.
   */
  pathRotation: degrees,
  rotateX: degrees,
  rotateY: degrees,
  rotateZ: degrees,
  scale,
  scaleX: scale,
  scaleY: scale,
  scaleZ: scale,
  skew: degrees,
  skewX: degrees,
  skewY: degrees,
  distance: px,
  translateX: px,
  translateY: px,
  translateZ: px,
  x: px,
  y: px,
  z: px,
  perspective: px,
  transformPerspective: px,
  opacity: alpha,
  originX: progressPercentage,
  originY: progressPercentage,
  originZ: px
};

// node_modules/motion-dom/dist/es/value/types/maps/number.mjs
var numberValueTypes = {
  // Border props
  borderWidth: px,
  borderTopWidth: px,
  borderRightWidth: px,
  borderBottomWidth: px,
  borderLeftWidth: px,
  borderRadius: px,
  borderTopLeftRadius: px,
  borderTopRightRadius: px,
  borderBottomRightRadius: px,
  borderBottomLeftRadius: px,
  // Positioning props
  width: px,
  maxWidth: px,
  height: px,
  maxHeight: px,
  top: px,
  right: px,
  bottom: px,
  left: px,
  inset: px,
  insetBlock: px,
  insetBlockStart: px,
  insetBlockEnd: px,
  insetInline: px,
  insetInlineStart: px,
  insetInlineEnd: px,
  // Spacing props
  padding: px,
  paddingTop: px,
  paddingRight: px,
  paddingBottom: px,
  paddingLeft: px,
  paddingBlock: px,
  paddingBlockStart: px,
  paddingBlockEnd: px,
  paddingInline: px,
  paddingInlineStart: px,
  paddingInlineEnd: px,
  margin: px,
  marginTop: px,
  marginRight: px,
  marginBottom: px,
  marginLeft: px,
  marginBlock: px,
  marginBlockStart: px,
  marginBlockEnd: px,
  marginInline: px,
  marginInlineStart: px,
  marginInlineEnd: px,
  // Typography
  fontSize: px,
  // Misc
  backgroundPositionX: px,
  backgroundPositionY: px,
  ...transformValueTypes,
  zIndex: int,
  // SVG
  fillOpacity: alpha,
  strokeOpacity: alpha,
  numOctaves: int
};

// node_modules/motion-dom/dist/es/value/types/maps/defaults.mjs
var defaultValueTypes = {
  ...numberValueTypes,
  // Color props
  color,
  backgroundColor: color,
  outlineColor: color,
  fill: color,
  stroke: color,
  // Border props
  borderColor: color,
  borderTopColor: color,
  borderRightColor: color,
  borderBottomColor: color,
  borderLeftColor: color,
  filter,
  WebkitFilter: filter,
  mask,
  WebkitMask: mask
};
var getDefaultValueType = (key) => defaultValueTypes[key];

// node_modules/motion-dom/dist/es/value/types/utils/animatable-none.mjs
var customTypes = /* @__PURE__ */ new Set([filter, mask]);
function getAnimatableNone2(key, value) {
  let defaultValueType = getDefaultValueType(key);
  if (!customTypes.has(defaultValueType))
    defaultValueType = complex;
  return defaultValueType.getAnimatableNone ? defaultValueType.getAnimatableNone(value) : void 0;
}

// node_modules/motion-dom/dist/es/animation/keyframes/utils/make-none-animatable.mjs
var invalidTemplates = /* @__PURE__ */ new Set(["auto", "none", "0"]);
function makeNoneKeyframesAnimatable(unresolvedKeyframes, noneKeyframeIndexes, name) {
  let i = 0;
  let animatableTemplate = void 0;
  while (i < unresolvedKeyframes.length && !animatableTemplate) {
    const keyframe = unresolvedKeyframes[i];
    if (typeof keyframe === "string" && !invalidTemplates.has(keyframe) && analyseComplexValue(keyframe).values.length) {
      animatableTemplate = unresolvedKeyframes[i];
    }
    i++;
  }
  if (animatableTemplate && name) {
    for (const noneIndex of noneKeyframeIndexes) {
      unresolvedKeyframes[noneIndex] = getAnimatableNone2(name, animatableTemplate);
    }
  }
}

// node_modules/motion-dom/dist/es/animation/keyframes/DOMKeyframesResolver.mjs
var DOMKeyframesResolver = class extends KeyframeResolver {
  constructor(unresolvedKeyframes, onComplete, name, motionValue2, element) {
    super(unresolvedKeyframes, onComplete, name, motionValue2, element, true);
  }
  readKeyframes() {
    const { unresolvedKeyframes, element, name } = this;
    if (!element || !element.current)
      return;
    super.readKeyframes();
    for (let i = 0; i < unresolvedKeyframes.length; i++) {
      let keyframe = unresolvedKeyframes[i];
      if (typeof keyframe === "string") {
        keyframe = keyframe.trim();
        if (isCSSVariableToken(keyframe)) {
          const resolved = getVariableValue(keyframe, element.current);
          if (resolved !== void 0) {
            unresolvedKeyframes[i] = resolved;
          }
          if (i === unresolvedKeyframes.length - 1) {
            this.finalKeyframe = keyframe;
          }
        }
      }
    }
    this.resolveNoneKeyframes();
    if (!positionalKeys.has(name) || unresolvedKeyframes.length !== 2) {
      return;
    }
    const [origin, target] = unresolvedKeyframes;
    const originType = findDimensionValueType(origin);
    const targetType = findDimensionValueType(target);
    const originHasVar = containsCSSVariable(origin);
    const targetHasVar = containsCSSVariable(target);
    if (originHasVar !== targetHasVar && positionalValues[name]) {
      this.needsMeasurement = true;
      return;
    }
    if (originType === targetType)
      return;
    if (isNumOrPxType(originType) && isNumOrPxType(targetType)) {
      for (let i = 0; i < unresolvedKeyframes.length; i++) {
        const value = unresolvedKeyframes[i];
        if (typeof value === "string") {
          unresolvedKeyframes[i] = parseFloat(value);
        }
      }
    } else if (positionalValues[name]) {
      this.needsMeasurement = true;
    }
  }
  resolveNoneKeyframes() {
    const { unresolvedKeyframes, name } = this;
    const noneKeyframeIndexes = [];
    for (let i = 0; i < unresolvedKeyframes.length; i++) {
      if (unresolvedKeyframes[i] === null || isNone(unresolvedKeyframes[i])) {
        noneKeyframeIndexes.push(i);
      }
    }
    if (noneKeyframeIndexes.length) {
      makeNoneKeyframesAnimatable(unresolvedKeyframes, noneKeyframeIndexes, name);
    }
  }
  measureInitialState() {
    const { element, unresolvedKeyframes, name } = this;
    if (!element || !element.current)
      return;
    if (name === "height") {
      this.suspendedScrollY = window.pageYOffset;
    }
    this.measuredOrigin = positionalValues[name](element.measureViewportBox(), window.getComputedStyle(element.current));
    unresolvedKeyframes[0] = this.measuredOrigin;
    const measureKeyframe = unresolvedKeyframes[unresolvedKeyframes.length - 1];
    if (measureKeyframe !== void 0) {
      element.getValue(name, measureKeyframe).jump(measureKeyframe, false);
    }
  }
  measureEndState() {
    const { element, name, unresolvedKeyframes } = this;
    if (!element || !element.current)
      return;
    const value = element.getValue(name);
    value && value.jump(this.measuredOrigin, false);
    const finalKeyframeIndex = unresolvedKeyframes.length - 1;
    const finalKeyframe = unresolvedKeyframes[finalKeyframeIndex];
    unresolvedKeyframes[finalKeyframeIndex] = positionalValues[name](element.measureViewportBox(), window.getComputedStyle(element.current));
    if (finalKeyframe !== null && this.finalKeyframe === void 0) {
      this.finalKeyframe = finalKeyframe;
    }
    if (this.removedTransforms?.length) {
      this.removedTransforms.forEach(([unsetTransformName, unsetTransformValue]) => {
        element.getValue(unsetTransformName).set(unsetTransformValue);
      });
    }
    this.resolveNoneKeyframes();
  }
};

// node_modules/motion-dom/dist/es/utils/border-radius.mjs
var cornerRadiusProps = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius"
];

// node_modules/motion-dom/dist/es/utils/resolve-elements.mjs
function resolveElements(elementOrSelector, scope, selectorCache) {
  if (elementOrSelector == null) {
    return [];
  }
  if (elementOrSelector instanceof EventTarget) {
    return [elementOrSelector];
  } else if (typeof elementOrSelector === "string") {
    let root = document;
    if (scope) {
      root = scope.current;
    }
    const elements = selectorCache?.[elementOrSelector] ?? root.querySelectorAll(elementOrSelector);
    return elements ? Array.from(elements) : [];
  }
  return Array.from(elementOrSelector).filter((element) => element != null);
}

// node_modules/motion-dom/dist/es/value/types/utils/get-as-type.mjs
var getValueAsType = (value, type) => {
  return type && typeof value === "number" ? type.transform(value) : value;
};

// node_modules/motion-dom/dist/es/utils/is-html-element.mjs
function isHTMLElement(element) {
  return isObject(element) && "offsetHeight" in element && !("ownerSVGElement" in element);
}

// node_modules/motion-dom/dist/es/frameloop/microtask.mjs
var { schedule: microtask, cancel: cancelMicrotask } = /* @__PURE__ */ createRenderBatcher(queueMicrotask, false);

// node_modules/motion-dom/dist/es/gestures/drag/state/is-active.mjs
var isDragging = {
  x: false,
  y: false
};
function isDragActive() {
  return isDragging.x || isDragging.y;
}

// node_modules/motion-dom/dist/es/gestures/drag/state/set-active.mjs
function setDragLock(axis) {
  if (axis === "x" || axis === "y") {
    if (isDragging[axis]) {
      return null;
    } else {
      isDragging[axis] = true;
      return () => {
        isDragging[axis] = false;
      };
    }
  } else {
    if (isDragging.x || isDragging.y) {
      return null;
    } else {
      isDragging.x = isDragging.y = true;
      return () => {
        isDragging.x = isDragging.y = false;
      };
    }
  }
}

// node_modules/motion-dom/dist/es/gestures/utils/setup.mjs
function setupGesture(elementOrSelector, options) {
  const elements = resolveElements(elementOrSelector);
  const gestureAbortController = new AbortController();
  const eventOptions = {
    passive: true,
    ...options,
    signal: gestureAbortController.signal
  };
  const cancel = () => gestureAbortController.abort();
  return [elements, eventOptions, cancel];
}

// node_modules/motion-dom/dist/es/gestures/hover.mjs
function isValidHover(event) {
  return !(event.pointerType === "touch" || isDragActive());
}
function hover(elementOrSelector, onHoverStart, options = {}) {
  const [elements, eventOptions, cancel] = setupGesture(elementOrSelector, options);
  elements.forEach((element) => {
    let isPressed = false;
    let deferredHoverEnd = false;
    let hoverEndCallback;
    const removePointerLeave = () => {
      element.removeEventListener("pointerleave", onPointerLeave);
    };
    const endHover = (event) => {
      if (hoverEndCallback) {
        hoverEndCallback(event);
        hoverEndCallback = void 0;
      }
      removePointerLeave();
    };
    const onPointerUp = (event) => {
      isPressed = false;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (deferredHoverEnd) {
        deferredHoverEnd = false;
        endHover(event);
      }
    };
    const onPointerDown = () => {
      isPressed = true;
      window.addEventListener("pointerup", onPointerUp, eventOptions);
      window.addEventListener("pointercancel", onPointerUp, eventOptions);
    };
    const onPointerLeave = (leaveEvent) => {
      if (leaveEvent.pointerType === "touch")
        return;
      if (isPressed) {
        deferredHoverEnd = true;
        return;
      }
      endHover(leaveEvent);
    };
    const onPointerEnter = (enterEvent) => {
      if (!isValidHover(enterEvent))
        return;
      deferredHoverEnd = false;
      const onHoverEnd = onHoverStart(element, enterEvent);
      if (typeof onHoverEnd !== "function")
        return;
      hoverEndCallback = onHoverEnd;
      element.addEventListener("pointerleave", onPointerLeave, eventOptions);
    };
    element.addEventListener("pointerenter", onPointerEnter, eventOptions);
    element.addEventListener("pointerdown", onPointerDown, eventOptions);
  });
  return cancel;
}

// node_modules/motion-dom/dist/es/gestures/utils/is-node-or-child.mjs
var isNodeOrChild = (parent, child) => {
  if (!child) {
    return false;
  } else if (parent === child) {
    return true;
  } else {
    return isNodeOrChild(parent, child.parentElement);
  }
};

// node_modules/motion-dom/dist/es/gestures/utils/is-primary-pointer.mjs
var isPrimaryPointer = (event) => {
  if (event.pointerType === "mouse") {
    return typeof event.button !== "number" || event.button <= 0;
  } else {
    return event.isPrimary !== false;
  }
};

// node_modules/motion-dom/dist/es/gestures/press/utils/is-keyboard-accessible.mjs
var keyboardAccessibleElements = /* @__PURE__ */ new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A"
]);
function isElementKeyboardAccessible(element) {
  return keyboardAccessibleElements.has(element.tagName) || element.isContentEditable === true;
}
var textInputElements = /* @__PURE__ */ new Set(["INPUT", "SELECT", "TEXTAREA"]);
function isElementTextInput(element) {
  return textInputElements.has(element.tagName) || element.isContentEditable === true;
}

// node_modules/motion-dom/dist/es/gestures/press/utils/state.mjs
var isPressing = /* @__PURE__ */ new WeakSet();

// node_modules/motion-dom/dist/es/gestures/press/utils/keyboard.mjs
function filterEvents(callback) {
  return (event) => {
    if (event.key !== "Enter")
      return;
    callback(event);
  };
}
function firePointerEvent(target, type) {
  target.dispatchEvent(new PointerEvent("pointer" + type, { isPrimary: true, bubbles: true }));
}
var enableKeyboardPress = (focusEvent, eventOptions) => {
  const element = focusEvent.currentTarget;
  if (!element)
    return;
  const handleKeydown = filterEvents(() => {
    if (isPressing.has(element))
      return;
    firePointerEvent(element, "down");
    const handleKeyup = filterEvents(() => {
      firePointerEvent(element, "up");
    });
    const handleBlur = () => firePointerEvent(element, "cancel");
    element.addEventListener("keyup", handleKeyup, eventOptions);
    element.addEventListener("blur", handleBlur, eventOptions);
  });
  element.addEventListener("keydown", handleKeydown, eventOptions);
  element.addEventListener("blur", () => element.removeEventListener("keydown", handleKeydown), eventOptions);
};

// node_modules/motion-dom/dist/es/gestures/press/index.mjs
function isValidPressEvent(event) {
  return isPrimaryPointer(event) && !isDragActive();
}
var claimedPointerDownEvents = /* @__PURE__ */ new WeakSet();
function press(targetOrSelector, onPressStart, options = {}) {
  const [targets, eventOptions, cancelEvents] = setupGesture(targetOrSelector, options);
  const startPress = (startEvent) => {
    const target = startEvent.currentTarget;
    if (!isValidPressEvent(startEvent))
      return;
    if (claimedPointerDownEvents.has(startEvent))
      return;
    isPressing.add(target);
    if (options.stopPropagation) {
      claimedPointerDownEvents.add(startEvent);
    }
    const onPressEnd = onPressStart(target, startEvent);
    const endEventOptions = { ...eventOptions, capture: true };
    const onPointerEnd = (endEvent, success) => {
      window.removeEventListener("pointerup", onPointerUp, endEventOptions);
      window.removeEventListener("pointercancel", onPointerCancel, endEventOptions);
      if (isPressing.has(target)) {
        isPressing.delete(target);
      }
      if (!isValidPressEvent(endEvent)) {
        return;
      }
      if (typeof onPressEnd === "function") {
        onPressEnd(endEvent, { success });
      }
    };
    const onPointerUp = (upEvent) => {
      onPointerEnd(upEvent, target === window || target === document || options.useGlobalTarget || isNodeOrChild(target, upEvent.target));
    };
    const onPointerCancel = (cancelEvent) => {
      onPointerEnd(cancelEvent, false);
    };
    window.addEventListener("pointerup", onPointerUp, endEventOptions);
    window.addEventListener("pointercancel", onPointerCancel, endEventOptions);
  };
  targets.forEach((target) => {
    const pointerDownTarget = options.useGlobalTarget ? window : target;
    pointerDownTarget.addEventListener("pointerdown", startPress, eventOptions);
    if (isHTMLElement(target)) {
      target.addEventListener("focus", (event) => enableKeyboardPress(event, eventOptions));
      if (!isElementKeyboardAccessible(target) && !target.hasAttribute("tabindex")) {
        target.tabIndex = 0;
      }
    }
  });
  return cancelEvents;
}

// node_modules/motion-dom/dist/es/utils/is-svg-element.mjs
function isSVGElement(element) {
  return isObject(element) && "ownerSVGElement" in element;
}

// node_modules/motion-dom/dist/es/resize/handle-element.mjs
var resizeHandlers = /* @__PURE__ */ new WeakMap();
var observer;
var getSize = (borderBoxAxis, svgAxis, htmlAxis) => (target, borderBoxSize) => {
  if (borderBoxSize && borderBoxSize[0]) {
    return borderBoxSize[0][borderBoxAxis + "Size"];
  } else if (isSVGElement(target) && "getBBox" in target) {
    return target.getBBox()[svgAxis];
  } else {
    return target[htmlAxis];
  }
};
var getWidth = /* @__PURE__ */ getSize("inline", "width", "offsetWidth");
var getHeight = /* @__PURE__ */ getSize("block", "height", "offsetHeight");
function notifyTarget({ target, borderBoxSize }) {
  resizeHandlers.get(target)?.forEach((handler) => {
    handler(target, {
      get width() {
        return getWidth(target, borderBoxSize);
      },
      get height() {
        return getHeight(target, borderBoxSize);
      }
    });
  });
}
function notifyAll(entries) {
  entries.forEach(notifyTarget);
}
function createResizeObserver() {
  if (typeof ResizeObserver === "undefined")
    return;
  observer = new ResizeObserver(notifyAll);
}
function resizeElement(target, handler) {
  if (!observer)
    createResizeObserver();
  const elements = resolveElements(target);
  elements.forEach((element) => {
    let elementHandlers = resizeHandlers.get(element);
    if (!elementHandlers) {
      elementHandlers = /* @__PURE__ */ new Set();
      resizeHandlers.set(element, elementHandlers);
    }
    elementHandlers.add(handler);
    observer?.observe(element);
  });
  return () => {
    elements.forEach((element) => {
      const elementHandlers = resizeHandlers.get(element);
      elementHandlers?.delete(handler);
      if (!elementHandlers?.size) {
        observer?.unobserve(element);
      }
    });
  };
}

// node_modules/motion-dom/dist/es/resize/handle-window.mjs
var windowCallbacks = /* @__PURE__ */ new Set();
var windowResizeHandler;
function createWindowResizeHandler() {
  windowResizeHandler = () => {
    const info = {
      get width() {
        return window.innerWidth;
      },
      get height() {
        return window.innerHeight;
      }
    };
    windowCallbacks.forEach((callback) => callback(info));
  };
  window.addEventListener("resize", windowResizeHandler);
}
function resizeWindow(callback) {
  windowCallbacks.add(callback);
  if (!windowResizeHandler)
    createWindowResizeHandler();
  return () => {
    windowCallbacks.delete(callback);
    if (!windowCallbacks.size && typeof windowResizeHandler === "function") {
      window.removeEventListener("resize", windowResizeHandler);
      windowResizeHandler = void 0;
    }
  };
}

// node_modules/motion-dom/dist/es/resize/index.mjs
function resize(a, b) {
  return typeof a === "function" ? resizeWindow(a) : resizeElement(a, b);
}

// node_modules/motion-dom/dist/es/stats/buffer.mjs
var statsBuffer = {
  value: null,
  addProjectionMetrics: null
};

// node_modules/motion-dom/dist/es/utils/is-svg-svg-element.mjs
function isSVGSVGElement(element) {
  return isSVGElement(element) && element.tagName === "svg";
}

// node_modules/motion-dom/dist/es/value/types/utils/find.mjs
var valueTypes = [...dimensionValueTypes, color, complex];
var findValueType = (v) => valueTypes.find(testValueType(v));

// node_modules/motion-dom/dist/es/projection/geometry/models.mjs
var createAxisDelta = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
});
var createDelta = () => ({
  x: createAxisDelta(),
  y: createAxisDelta()
});
var createAxis = () => ({ min: 0, max: 0 });
var createBox = () => ({
  x: createAxis(),
  y: createAxis()
});

// node_modules/motion-dom/dist/es/render/store.mjs
var visualElementStore = /* @__PURE__ */ new WeakMap();

// node_modules/motion-dom/dist/es/render/utils/is-animation-controls.mjs
function isAnimationControls(v) {
  return v !== null && typeof v === "object" && typeof v.start === "function";
}

// node_modules/motion-dom/dist/es/render/utils/is-variant-label.mjs
function isVariantLabel(v) {
  return typeof v === "string" || Array.isArray(v);
}

// node_modules/motion-dom/dist/es/render/utils/variant-props.mjs
var variantPriorityOrder = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
];
var variantProps = ["initial", ...variantPriorityOrder];

// node_modules/motion-dom/dist/es/render/utils/is-controlling-variants.mjs
function isControllingVariants(props) {
  return isAnimationControls(props.animate) || variantProps.some((name) => isVariantLabel(props[name]));
}
function isVariantNode(props) {
  return Boolean(isControllingVariants(props) || props.variants);
}

// node_modules/motion-dom/dist/es/render/utils/motion-values.mjs
function updateMotionValuesFromProps(element, next, prev) {
  for (const key in next) {
    const nextValue = next[key];
    const prevValue = prev[key];
    if (isMotionValue(nextValue)) {
      element.addValue(key, nextValue);
    } else if (isMotionValue(prevValue)) {
      element.addValue(key, motionValue(nextValue, { owner: element }));
    } else if (prevValue !== nextValue) {
      if (element.hasValue(key)) {
        const existingValue = element.getValue(key);
        if (existingValue.liveStyle === true) {
          existingValue.jump(nextValue);
        } else if (!existingValue.hasAnimated) {
          existingValue.set(nextValue);
        }
      } else {
        const latestValue = element.getStaticValue(key);
        element.addValue(key, motionValue(latestValue !== void 0 ? latestValue : nextValue, { owner: element }));
      }
    }
  }
  for (const key in prev) {
    if (next[key] === void 0)
      element.removeValue(key);
  }
  return next;
}

// node_modules/motion-dom/dist/es/render/utils/reduced-motion/state.mjs
var prefersReducedMotion = { current: null };
var hasReducedMotionListener = { current: false };

// node_modules/motion-dom/dist/es/render/utils/reduced-motion/index.mjs
var isBrowser2 = typeof window !== "undefined";
function initPrefersReducedMotion() {
  hasReducedMotionListener.current = true;
  if (!isBrowser2)
    return;
  if (window.matchMedia) {
    const motionMediaQuery = window.matchMedia("(prefers-reduced-motion)");
    const setReducedMotionPreferences = () => prefersReducedMotion.current = motionMediaQuery.matches;
    motionMediaQuery.addEventListener("change", setReducedMotionPreferences);
    setReducedMotionPreferences();
  } else {
    prefersReducedMotion.current = false;
  }
}

// node_modules/motion-dom/dist/es/render/VisualElement.mjs
var propEventHandlers = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
var featureDefinitions = {};
function setFeatureDefinitions(definitions) {
  featureDefinitions = definitions;
}
function getFeatureDefinitions() {
  return featureDefinitions;
}
var VisualElement = class {
  /**
   * This method takes React props and returns found MotionValues. For example, HTML
   * MotionValues will be found within the style prop, whereas for Three.js within attribute arrays.
   *
   * This isn't an abstract method as it needs calling in the constructor, but it is
   * intended to be one.
   */
  scrapeMotionValuesFromProps(_props, _prevProps, _visualElement) {
    return {};
  }
  constructor({ parent, props, presenceContext, reducedMotionConfig, skipAnimations, blockInitialAnimation, visualState }, options = {}) {
    this.current = null;
    this.children = /* @__PURE__ */ new Set();
    this.isVariantNode = false;
    this.isControllingVariants = false;
    this.shouldReduceMotion = null;
    this.shouldSkipAnimations = false;
    this.values = /* @__PURE__ */ new Map();
    this.KeyframeResolver = KeyframeResolver;
    this.features = {};
    this.valueSubscriptions = /* @__PURE__ */ new Map();
    this.prevMotionValues = {};
    this.hasBeenMounted = false;
    this.events = {};
    this.propEventSubscriptions = {};
    this.notifyUpdate = () => this.notify("Update", this.latestValues);
    this.render = () => {
      if (!this.current)
        return;
      this.triggerBuild();
      this.renderInstance(this.current, this.renderState, this.props.style, this.projection);
    };
    this.renderScheduledAt = 0;
    this.scheduleRender = () => {
      const now2 = time.now();
      if (this.renderScheduledAt < now2) {
        this.renderScheduledAt = now2;
        frame.render(this.render, false, true);
      }
    };
    const { latestValues, renderState } = visualState;
    this.latestValues = latestValues;
    this.baseTarget = { ...latestValues };
    this.initialValues = props.initial ? { ...latestValues } : {};
    this.renderState = renderState;
    this.parent = parent;
    this.props = props;
    this.presenceContext = presenceContext;
    this.depth = parent ? parent.depth + 1 : 0;
    this.reducedMotionConfig = reducedMotionConfig;
    this.skipAnimationsConfig = skipAnimations;
    this.options = options;
    this.blockInitialAnimation = Boolean(blockInitialAnimation);
    this.isControllingVariants = isControllingVariants(props);
    this.isVariantNode = isVariantNode(props);
    if (this.isVariantNode) {
      this.variantChildren = /* @__PURE__ */ new Set();
    }
    this.manuallyAnimateOnMount = Boolean(parent && parent.current);
    const { willChange, ...initialMotionValues } = this.scrapeMotionValuesFromProps(props, {}, this);
    for (const key in initialMotionValues) {
      const value = initialMotionValues[key];
      if (latestValues[key] !== void 0 && isMotionValue(value)) {
        value.set(latestValues[key]);
      }
    }
  }
  mount(instance) {
    if (this.hasBeenMounted) {
      for (const key in this.initialValues) {
        this.values.get(key)?.jump(this.initialValues[key]);
        this.latestValues[key] = this.initialValues[key];
      }
    }
    this.current = instance;
    visualElementStore.set(instance, this);
    if (this.projection && !this.projection.instance) {
      this.projection.mount(instance);
    }
    if (this.parent && this.isVariantNode && !this.isControllingVariants) {
      this.removeFromVariantTree = this.parent.addVariantChild(this);
    }
    this.values.forEach((value, key) => this.bindToMotionValue(key, value));
    if (this.reducedMotionConfig === "never") {
      this.shouldReduceMotion = false;
    } else if (this.reducedMotionConfig === "always") {
      this.shouldReduceMotion = true;
    } else {
      if (!hasReducedMotionListener.current) {
        initPrefersReducedMotion();
      }
      this.shouldReduceMotion = prefersReducedMotion.current;
    }
    if (process.env.NODE_ENV !== "production") {
      warnOnce(this.shouldReduceMotion !== true, "You have Reduced Motion enabled on your device. Animations may not appear as expected.", "reduced-motion-disabled");
    }
    this.shouldSkipAnimations = this.skipAnimationsConfig ?? false;
    this.parent?.addChild(this);
    this.update(this.props, this.presenceContext);
    this.hasBeenMounted = true;
  }
  unmount() {
    this.projection && this.projection.unmount();
    cancelFrame(this.notifyUpdate);
    cancelFrame(this.render);
    this.valueSubscriptions.forEach((remove) => remove());
    this.valueSubscriptions.clear();
    this.removeFromVariantTree && this.removeFromVariantTree();
    this.parent?.removeChild(this);
    for (const key in this.events) {
      this.events[key].clear();
    }
    for (const key in this.features) {
      const feature = this.features[key];
      if (feature) {
        feature.unmount();
        feature.isMounted = false;
      }
    }
    this.current = null;
  }
  addChild(child) {
    this.children.add(child);
    this.enteringChildren ?? (this.enteringChildren = /* @__PURE__ */ new Set());
    this.enteringChildren.add(child);
  }
  removeChild(child) {
    this.children.delete(child);
    this.enteringChildren && this.enteringChildren.delete(child);
  }
  bindToMotionValue(key, value) {
    if (this.valueSubscriptions.has(key)) {
      this.valueSubscriptions.get(key)();
    }
    if (value.accelerate && acceleratedValues.has(key) && this.current instanceof HTMLElement) {
      const { factory, keyframes: keyframes2, times, ease: ease2, duration } = value.accelerate;
      const animation = new NativeAnimation({
        element: this.current,
        name: key,
        keyframes: keyframes2,
        times,
        ease: ease2,
        duration: secondsToMilliseconds(duration)
      });
      const cleanup = factory(animation);
      this.valueSubscriptions.set(key, () => {
        cleanup();
        animation.cancel();
      });
      return;
    }
    const valueIsTransform = transformProps.has(key);
    if (valueIsTransform && this.onBindTransform) {
      this.onBindTransform();
    }
    const removeOnChange = value.on("change", (latestValue) => {
      this.latestValues[key] = latestValue;
      this.props.onUpdate && frame.preRender(this.notifyUpdate);
      if (valueIsTransform && this.projection) {
        this.projection.isTransformDirty = true;
      }
      this.scheduleRender();
    });
    let removeSyncCheck;
    if (typeof window !== "undefined" && window.MotionCheckAppearSync) {
      removeSyncCheck = window.MotionCheckAppearSync(this, key, value);
    }
    this.valueSubscriptions.set(key, () => {
      removeOnChange();
      if (removeSyncCheck)
        removeSyncCheck();
    });
  }
  sortNodePosition(other) {
    if (!this.current || !this.sortInstanceNodePosition || this.type !== other.type) {
      return 0;
    }
    return this.sortInstanceNodePosition(this.current, other.current);
  }
  updateFeatures() {
    let key = "animation";
    for (key in featureDefinitions) {
      const featureDefinition = featureDefinitions[key];
      if (!featureDefinition)
        continue;
      const { isEnabled, Feature: FeatureConstructor } = featureDefinition;
      if (!this.features[key] && FeatureConstructor && isEnabled(this.props)) {
        this.features[key] = new FeatureConstructor(this);
      }
      if (this.features[key]) {
        const feature = this.features[key];
        if (feature.isMounted) {
          feature.update();
        } else {
          feature.mount();
          feature.isMounted = true;
        }
      }
    }
  }
  triggerBuild() {
    this.build(this.renderState, this.latestValues, this.props);
  }
  /**
   * Measure the current viewport box with or without transforms.
   * Only measures axis-aligned boxes, rotate and skew must be manually
   * removed with a re-render to work.
   */
  measureViewportBox() {
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : createBox();
  }
  getStaticValue(key) {
    return this.latestValues[key];
  }
  setStaticValue(key, value) {
    this.latestValues[key] = value;
  }
  /**
   * Update the provided props. Ensure any newly-added motion values are
   * added to our map, old ones removed, and listeners updated.
   */
  update(props, presenceContext) {
    if (props.transformTemplate || this.props.transformTemplate) {
      this.scheduleRender();
    }
    this.prevProps = this.props;
    this.props = props;
    this.prevPresenceContext = this.presenceContext;
    this.presenceContext = presenceContext;
    for (let i = 0; i < propEventHandlers.length; i++) {
      const key = propEventHandlers[i];
      if (this.propEventSubscriptions[key]) {
        this.propEventSubscriptions[key]();
        delete this.propEventSubscriptions[key];
      }
      const listenerName = "on" + key;
      const listener = props[listenerName];
      if (listener) {
        this.propEventSubscriptions[key] = this.on(key, listener);
      }
    }
    this.prevMotionValues = updateMotionValuesFromProps(this, this.scrapeMotionValuesFromProps(props, this.prevProps || {}, this), this.prevMotionValues);
    if (this.handleChildMotionValue) {
      this.handleChildMotionValue();
    }
  }
  getProps() {
    return this.props;
  }
  /**
   * Returns the variant definition with a given name.
   */
  getVariant(name) {
    return this.props.variants ? this.props.variants[name] : void 0;
  }
  /**
   * Returns the defined default transition on this component.
   */
  getDefaultTransition() {
    return this.props.transition;
  }
  getTransformPagePoint() {
    return this.props.transformPagePoint;
  }
  getClosestVariantNode() {
    return this.isVariantNode ? this : this.parent ? this.parent.getClosestVariantNode() : void 0;
  }
  /**
   * Add a child visual element to our set of children.
   */
  addVariantChild(child) {
    const closestVariantNode = this.getClosestVariantNode();
    if (closestVariantNode) {
      closestVariantNode.variantChildren && closestVariantNode.variantChildren.add(child);
      return () => closestVariantNode.variantChildren.delete(child);
    }
  }
  /**
   * Add a motion value and bind it to this visual element.
   */
  addValue(key, value) {
    const existingValue = this.values.get(key);
    if (value !== existingValue) {
      if (existingValue)
        this.removeValue(key);
      this.bindToMotionValue(key, value);
      this.values.set(key, value);
      this.latestValues[key] = value.get();
    }
  }
  /**
   * Remove a motion value and unbind any active subscriptions.
   */
  removeValue(key) {
    this.values.delete(key);
    const unsubscribe = this.valueSubscriptions.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.valueSubscriptions.delete(key);
    }
    delete this.latestValues[key];
    this.removeValueFromRenderState(key, this.renderState);
  }
  /**
   * Check whether we have a motion value for this key
   */
  hasValue(key) {
    return this.values.has(key);
  }
  getValue(key, defaultValue) {
    if (this.props.values && this.props.values[key]) {
      return this.props.values[key];
    }
    let value = this.values.get(key);
    if (value === void 0 && defaultValue !== void 0) {
      value = motionValue(defaultValue === null ? void 0 : defaultValue, { owner: this });
      this.addValue(key, value);
    }
    return value;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(key, target) {
    let value = this.latestValues[key] !== void 0 || !this.current ? this.latestValues[key] : this.getBaseTargetFromProps(this.props, key) ?? this.readValueFromInstance(this.current, key, this.options);
    if (value !== void 0 && value !== null) {
      if (typeof value === "string" && (isNumericalString(value) || isZeroValueString(value))) {
        value = parseFloat(value);
      } else if (!findValueType(value) && complex.test(target)) {
        value = getAnimatableNone2(key, target);
      }
      this.setBaseTarget(key, isMotionValue(value) ? value.get() : value);
    }
    return isMotionValue(value) ? value.get() : value;
  }
  /**
   * Set the base target to later animate back to. This is currently
   * only hydrated on creation and when we first read a value.
   */
  setBaseTarget(key, value) {
    this.baseTarget[key] = value;
  }
  /**
   * Find the base target for a value thats been removed from all animation
   * props.
   */
  getBaseTarget(key) {
    const { initial } = this.props;
    let valueFromInitial;
    if (typeof initial === "string" || typeof initial === "object") {
      const variant = resolveVariantFromProps(this.props, initial, this.presenceContext?.custom);
      if (variant) {
        valueFromInitial = variant[key];
      }
    }
    if (initial && valueFromInitial !== void 0) {
      return valueFromInitial;
    }
    const target = this.getBaseTargetFromProps(this.props, key);
    if (target !== void 0 && !isMotionValue(target))
      return target;
    return this.initialValues[key] !== void 0 && valueFromInitial === void 0 ? void 0 : this.baseTarget[key];
  }
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = new SubscriptionManager();
    }
    return this.events[eventName].add(callback);
  }
  notify(eventName, ...args) {
    if (this.events[eventName]) {
      this.events[eventName].notify(...args);
    }
  }
  scheduleRenderMicrotask() {
    microtask.render(this.render);
  }
};

// node_modules/motion-dom/dist/es/render/dom/DOMVisualElement.mjs
var DOMVisualElement = class extends VisualElement {
  constructor() {
    super(...arguments);
    this.KeyframeResolver = DOMKeyframesResolver;
  }
  sortInstanceNodePosition(a, b) {
    return a.compareDocumentPosition(b) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(props, key) {
    const style = props.style;
    return style ? style[key] : void 0;
  }
  removeValueFromRenderState(key, { vars, style }) {
    delete vars[key];
    delete style[key];
  }
  handleChildMotionValue() {
    if (this.childSubscription) {
      this.childSubscription();
      delete this.childSubscription;
    }
    const { children } = this.props;
    if (isMotionValue(children)) {
      this.childSubscription = children.on("change", (latest) => {
        if (this.current) {
          this.current.textContent = `${latest}`;
        }
      });
    }
  }
};

// node_modules/motion-dom/dist/es/render/Feature.mjs
var Feature = class {
  constructor(node) {
    this.isMounted = false;
    this.node = node;
  }
  update() {
  }
};

// node_modules/motion-dom/dist/es/projection/geometry/conversion.mjs
function convertBoundingBoxToBox({ top, left, right, bottom }) {
  return {
    x: { min: left, max: right },
    y: { min: top, max: bottom }
  };
}
function convertBoxToBoundingBox({ x, y }) {
  return { top: y.min, right: x.max, bottom: y.max, left: x.min };
}
function transformBoxPoints(point, transformPoint2) {
  if (!transformPoint2)
    return point;
  const topLeft = transformPoint2({ x: point.left, y: point.top });
  const bottomRight = transformPoint2({ x: point.right, y: point.bottom });
  return {
    top: topLeft.y,
    left: topLeft.x,
    bottom: bottomRight.y,
    right: bottomRight.x
  };
}

// node_modules/motion-dom/dist/es/projection/utils/has-transform.mjs
function isIdentityScale(scale2) {
  return scale2 === void 0 || scale2 === 1;
}
function hasScale({ scale: scale2, scaleX: scaleX2, scaleY: scaleY2 }) {
  return !isIdentityScale(scale2) || !isIdentityScale(scaleX2) || !isIdentityScale(scaleY2);
}
function hasTransform(values) {
  return hasScale(values) || has2DTranslate(values) || values.z || values.rotate || values.rotateX || values.rotateY || values.skewX || values.skewY;
}
function has2DTranslate(values) {
  return is2DTranslate(values.x) || is2DTranslate(values.y);
}
function is2DTranslate(value) {
  return value && value !== "0%";
}

// node_modules/motion-dom/dist/es/projection/geometry/delta-apply.mjs
function scalePoint(point, scale2, originPoint) {
  const distanceFromOrigin = point - originPoint;
  const scaled = scale2 * distanceFromOrigin;
  return originPoint + scaled;
}
function applyPointDelta(point, translate, scale2, originPoint, boxScale) {
  if (boxScale !== void 0) {
    point = scalePoint(point, boxScale, originPoint);
  }
  return scalePoint(point, scale2, originPoint) + translate;
}
function applyAxisDelta(axis, translate = 0, scale2 = 1, originPoint, boxScale) {
  axis.min = applyPointDelta(axis.min, translate, scale2, originPoint, boxScale);
  axis.max = applyPointDelta(axis.max, translate, scale2, originPoint, boxScale);
}
function applyBoxDelta(box, { x, y }) {
  applyAxisDelta(box.x, x.translate, x.scale, x.originPoint);
  applyAxisDelta(box.y, y.translate, y.scale, y.originPoint);
}
var TREE_SCALE_SNAP_MIN = 0.999999999999;
var TREE_SCALE_SNAP_MAX = 1.0000000000001;
function applyTreeDeltas(box, treeScale, treePath, isSharedTransition = false) {
  const treeLength = treePath.length;
  if (!treeLength)
    return;
  treeScale.x = treeScale.y = 1;
  let node;
  let delta;
  for (let i = 0; i < treeLength; i++) {
    node = treePath[i];
    delta = node.projectionDelta;
    const { visualElement } = node.options;
    if (visualElement && visualElement.props.style && visualElement.props.style.display === "contents") {
      continue;
    }
    if (isSharedTransition && node.options.layoutScroll && node.scroll && node !== node.root) {
      translateAxis(box.x, -node.scroll.offset.x);
      translateAxis(box.y, -node.scroll.offset.y);
    }
    if (delta) {
      treeScale.x *= delta.x.scale;
      treeScale.y *= delta.y.scale;
      applyBoxDelta(box, delta);
    }
    if (isSharedTransition && hasTransform(node.latestValues)) {
      transformBox(box, node.latestValues, node.layout?.layoutBox);
    }
  }
  if (treeScale.x < TREE_SCALE_SNAP_MAX && treeScale.x > TREE_SCALE_SNAP_MIN) {
    treeScale.x = 1;
  }
  if (treeScale.y < TREE_SCALE_SNAP_MAX && treeScale.y > TREE_SCALE_SNAP_MIN) {
    treeScale.y = 1;
  }
}
function translateAxis(axis, distance2) {
  axis.min += distance2;
  axis.max += distance2;
}
function transformAxis(axis, axisTranslate, axisScale, boxScale, axisOrigin = 0.5) {
  const originPoint = mixNumber(axis.min, axis.max, axisOrigin);
  applyAxisDelta(axis, axisTranslate, axisScale, originPoint, boxScale);
}
function resolveAxisTranslate(value, axis) {
  if (typeof value === "string") {
    return parseFloat(value) / 100 * (axis.max - axis.min);
  }
  return value;
}
function transformBox(box, transform, sourceBox) {
  const resolveBox = sourceBox ?? box;
  transformAxis(box.x, resolveAxisTranslate(transform.x, resolveBox.x), transform.scaleX, transform.scale, transform.originX);
  transformAxis(box.y, resolveAxisTranslate(transform.y, resolveBox.y), transform.scaleY, transform.scale, transform.originY);
}

// node_modules/motion-dom/dist/es/projection/utils/measure.mjs
function measureViewportBox(instance, transformPoint2) {
  return convertBoundingBoxToBox(transformBoxPoints(instance.getBoundingClientRect(), transformPoint2));
}
function measurePageBox(element, rootProjectionNode2, transformPagePoint) {
  const viewportBox = measureViewportBox(element, transformPagePoint);
  const { scroll } = rootProjectionNode2;
  if (scroll) {
    translateAxis(viewportBox.x, scroll.offset.x);
    translateAxis(viewportBox.y, scroll.offset.y);
  }
  return viewportBox;
}

// node_modules/motion-dom/dist/es/render/html/utils/build-transform.mjs
var translateAlias = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
};
var numTransforms = transformPropOrder.length;
function buildTransform(latestValues, transform, transformTemplate) {
  let transformString = "";
  let transformIsDefault = true;
  for (let i = 0; i < numTransforms; i++) {
    const key = transformPropOrder[i];
    const value = latestValues[key];
    if (value === void 0)
      continue;
    let valueIsDefault = true;
    if (typeof value === "number") {
      valueIsDefault = value === (key.startsWith("scale") ? 1 : 0);
    } else {
      const parsed = parseFloat(value);
      valueIsDefault = key.startsWith("scale") ? parsed === 1 : parsed === 0;
    }
    if (!valueIsDefault || transformTemplate) {
      const valueAsType = getValueAsType(value, numberValueTypes[key]);
      if (!valueIsDefault) {
        transformIsDefault = false;
        const transformName = translateAlias[key] || key;
        transformString += `${transformName}(${valueAsType}) `;
      }
      if (transformTemplate) {
        transform[key] = valueAsType;
      }
    }
  }
  const pathRotation = latestValues.pathRotation;
  if (pathRotation) {
    transformIsDefault = false;
    transformString += `rotate(${getValueAsType(pathRotation, numberValueTypes.pathRotation)}) `;
  }
  transformString = transformString.trim();
  if (transformTemplate) {
    transformString = transformTemplate(transform, transformIsDefault ? "" : transformString);
  } else if (transformIsDefault) {
    transformString = "none";
  }
  return transformString;
}

// node_modules/motion-dom/dist/es/render/html/utils/build-styles.mjs
function buildHTMLStyles(state, latestValues, transformTemplate) {
  const { style, vars, transformOrigin } = state;
  let hasTransform2 = false;
  let hasTransformOrigin = false;
  for (const key in latestValues) {
    const value = latestValues[key];
    if (transformProps.has(key)) {
      hasTransform2 = true;
      continue;
    } else if (isCSSVariableName(key)) {
      vars[key] = value;
      continue;
    } else {
      const valueAsType = getValueAsType(value, numberValueTypes[key]);
      if (key.startsWith("origin")) {
        hasTransformOrigin = true;
        transformOrigin[key] = valueAsType;
      } else {
        style[key] = valueAsType;
      }
    }
  }
  if (!latestValues.transform) {
    if (hasTransform2 || transformTemplate) {
      style.transform = buildTransform(latestValues, state.transform, transformTemplate);
    } else if (style.transform) {
      style.transform = "none";
    }
  }
  if (hasTransformOrigin) {
    const { originX = "50%", originY = "50%", originZ = 0 } = transformOrigin;
    style.transformOrigin = `${originX} ${originY} ${originZ}`;
  }
}

// node_modules/motion-dom/dist/es/render/html/utils/render.mjs
function renderHTML(element, { style, vars }, styleProp, projection) {
  const elementStyle = element.style;
  let key;
  for (key in style) {
    elementStyle[key] = style[key];
  }
  projection?.applyProjectionStyles(elementStyle, styleProp);
  for (key in vars) {
    elementStyle.setProperty(key, vars[key]);
  }
}

// node_modules/motion-dom/dist/es/projection/styles/scale-border-radius.mjs
function pixelsToPercent(pixels, axis) {
  if (axis.max === axis.min)
    return 0;
  return pixels / (axis.max - axis.min) * 100;
}
var correctBorderRadius = {
  correct: (latest, node) => {
    if (!node.target)
      return latest;
    if (typeof latest === "string") {
      if (px.test(latest)) {
        latest = parseFloat(latest);
      } else {
        return latest;
      }
    }
    const x = pixelsToPercent(latest, node.target.x);
    const y = pixelsToPercent(latest, node.target.y);
    return `${x}% ${y}%`;
  }
};

// node_modules/motion-dom/dist/es/projection/styles/scale-box-shadow.mjs
var correctBoxShadow = {
  correct: (latest, { treeScale, projectionDelta }) => {
    const original = latest;
    const shadow = complex.parse(latest);
    if (shadow.length > 5)
      return original;
    const template = complex.createTransformer(latest);
    const offset = typeof shadow[0] !== "number" ? 1 : 0;
    const xScale = projectionDelta.x.scale * treeScale.x;
    const yScale = projectionDelta.y.scale * treeScale.y;
    shadow[0 + offset] /= xScale;
    shadow[1 + offset] /= yScale;
    const averageScale = mixNumber(xScale, yScale, 0.5);
    if (typeof shadow[2 + offset] === "number")
      shadow[2 + offset] /= averageScale;
    if (typeof shadow[3 + offset] === "number")
      shadow[3 + offset] /= averageScale;
    return template(shadow);
  }
};

// node_modules/motion-dom/dist/es/projection/styles/scale-correction.mjs
var scaleCorrectors = {
  borderRadius: {
    ...correctBorderRadius,
    applyTo: [...cornerRadiusProps]
  },
  borderTopLeftRadius: correctBorderRadius,
  borderTopRightRadius: correctBorderRadius,
  borderBottomLeftRadius: correctBorderRadius,
  borderBottomRightRadius: correctBorderRadius,
  boxShadow: correctBoxShadow
};

// node_modules/motion-dom/dist/es/render/utils/is-forced-motion-value.mjs
function isForcedMotionValue(key, { layout: layout2, layoutId }) {
  return transformProps.has(key) || key.startsWith("origin") || (layout2 || layoutId !== void 0) && (!!scaleCorrectors[key] || key === "opacity");
}

// node_modules/motion-dom/dist/es/render/html/utils/scrape-motion-values.mjs
function scrapeMotionValuesFromProps(props, prevProps, visualElement) {
  const style = props.style;
  const prevStyle = prevProps?.style;
  const newValues = {};
  if (!style)
    return newValues;
  for (const key in style) {
    if (isMotionValue(style[key]) || prevStyle && isMotionValue(prevStyle[key]) || isForcedMotionValue(key, props) || visualElement?.getValue(key)?.liveStyle !== void 0) {
      newValues[key] = style[key];
    }
  }
  return newValues;
}

// node_modules/motion-dom/dist/es/render/html/HTMLVisualElement.mjs
function getComputedStyle2(element) {
  return window.getComputedStyle(element);
}
var HTMLVisualElement = class extends DOMVisualElement {
  constructor() {
    super(...arguments);
    this.type = "html";
    this.renderInstance = renderHTML;
  }
  mount(instance) {
    invariant(Boolean(instance.style), "motion.create() components must forward their ref to a HTML or SVG element", "custom-component-ref");
    super.mount(instance);
  }
  readValueFromInstance(instance, key) {
    if (transformProps.has(key)) {
      return this.projection?.isProjecting ? defaultTransformValue(key) : readTransformValue(instance, key);
    } else {
      const computedStyle = getComputedStyle2(instance);
      const value = (isCSSVariableName(key) ? computedStyle.getPropertyValue(key) : computedStyle[key]) || 0;
      return typeof value === "string" ? value.trim() : value;
    }
  }
  measureInstanceViewportBox(instance, { transformPagePoint }) {
    return measureViewportBox(instance, transformPagePoint);
  }
  build(renderState, latestValues, props) {
    buildHTMLStyles(renderState, latestValues, props.transformTemplate);
  }
  scrapeMotionValuesFromProps(props, prevProps, visualElement) {
    return scrapeMotionValuesFromProps(props, prevProps, visualElement);
  }
};

// node_modules/motion-dom/dist/es/render/svg/utils/path.mjs
var dashKeys = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
};
var camelKeys = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function buildSVGPath(attrs, length, spacing = 1, offset = 0, useDashCase = true) {
  attrs.pathLength = 1;
  const keys = useDashCase ? dashKeys : camelKeys;
  attrs[keys.offset] = `${-offset}`;
  attrs[keys.array] = `${length} ${spacing}`;
}

// node_modules/motion-dom/dist/es/render/svg/utils/build-attrs.mjs
var cssMotionPathProperties = [
  "offsetDistance",
  "offsetPath",
  "offsetRotate",
  "offsetAnchor"
];
function buildSVGAttrs(state, {
  attrX,
  attrY,
  attrScale,
  pathLength,
  pathSpacing = 1,
  pathOffset = 0,
  // This is object creation, which we try to avoid per-frame.
  ...latest
}, isSVGTag2, transformTemplate, styleProp) {
  buildHTMLStyles(state, latest, transformTemplate);
  if (isSVGTag2) {
    if (state.style.viewBox) {
      state.attrs.viewBox = state.style.viewBox;
    }
    return;
  }
  state.attrs = state.style;
  state.style = {};
  const { attrs, style } = state;
  if (attrs.transform) {
    style.transform = attrs.transform;
    delete attrs.transform;
  }
  if (style.transform || attrs.transformOrigin) {
    style.transformOrigin = attrs.transformOrigin ?? "50% 50%";
    delete attrs.transformOrigin;
  }
  if (style.transform) {
    style.transformBox = styleProp?.transformBox ?? "fill-box";
    delete attrs.transformBox;
  }
  for (const key of cssMotionPathProperties) {
    if (attrs[key] !== void 0) {
      style[key] = attrs[key];
      delete attrs[key];
    }
  }
  if (attrX !== void 0)
    attrs.x = attrX;
  if (attrY !== void 0)
    attrs.y = attrY;
  if (attrScale !== void 0)
    attrs.scale = attrScale;
  if (pathLength !== void 0) {
    buildSVGPath(attrs, pathLength, pathSpacing, pathOffset, false);
  }
}

// node_modules/motion-dom/dist/es/render/svg/utils/camel-case-attrs.mjs
var camelCaseAttributes = /* @__PURE__ */ new Set([
  "baseFrequency",
  "diffuseConstant",
  "kernelMatrix",
  "kernelUnitLength",
  "keySplines",
  "keyTimes",
  "limitingConeAngle",
  "markerHeight",
  "markerWidth",
  "numOctaves",
  "targetX",
  "targetY",
  "surfaceScale",
  "specularConstant",
  "specularExponent",
  "stdDeviation",
  "tableValues",
  "viewBox",
  "gradientTransform",
  "pathLength",
  "startOffset",
  "textLength",
  "lengthAdjust"
]);

// node_modules/motion-dom/dist/es/render/svg/utils/is-svg-tag.mjs
var isSVGTag = (tag) => typeof tag === "string" && tag.toLowerCase() === "svg";

// node_modules/motion-dom/dist/es/render/svg/utils/render.mjs
function renderSVG(element, renderState, _styleProp, projection) {
  renderHTML(element, renderState, void 0, projection);
  for (const key in renderState.attrs) {
    element.setAttribute(!camelCaseAttributes.has(key) ? camelToDash(key) : key, renderState.attrs[key]);
  }
}

// node_modules/motion-dom/dist/es/render/svg/utils/scrape-motion-values.mjs
function scrapeMotionValuesFromProps2(props, prevProps, visualElement) {
  const newValues = scrapeMotionValuesFromProps(props, prevProps, visualElement);
  for (const key in props) {
    if (isMotionValue(props[key]) || isMotionValue(prevProps[key])) {
      const targetKey = transformPropOrder.indexOf(key) !== -1 ? "attr" + key.charAt(0).toUpperCase() + key.substring(1) : key;
      newValues[targetKey] = props[key];
    }
  }
  return newValues;
}

// node_modules/motion-dom/dist/es/render/svg/SVGVisualElement.mjs
var SVGVisualElement = class extends DOMVisualElement {
  constructor() {
    super(...arguments);
    this.type = "svg";
    this.isSVGTag = false;
    this.measureInstanceViewportBox = createBox;
  }
  getBaseTargetFromProps(props, key) {
    return props[key];
  }
  readValueFromInstance(instance, key) {
    if (transformProps.has(key)) {
      const defaultType = getDefaultValueType(key);
      return defaultType ? defaultType.default || 0 : 0;
    }
    key = !camelCaseAttributes.has(key) ? camelToDash(key) : key;
    return instance.getAttribute(key);
  }
  scrapeMotionValuesFromProps(props, prevProps, visualElement) {
    return scrapeMotionValuesFromProps2(props, prevProps, visualElement);
  }
  build(renderState, latestValues, props) {
    buildSVGAttrs(renderState, latestValues, this.isSVGTag, props.transformTemplate, props.style);
  }
  renderInstance(instance, renderState, styleProp, projection) {
    renderSVG(instance, renderState, styleProp, projection);
  }
  mount(instance) {
    this.isSVGTag = isSVGTag(instance.tagName);
    super.mount(instance);
  }
};

// node_modules/motion-dom/dist/es/render/utils/get-variant-context.mjs
var numVariantProps = variantProps.length;
function getVariantContext(visualElement) {
  if (!visualElement)
    return void 0;
  if (!visualElement.isControllingVariants) {
    const context2 = visualElement.parent ? getVariantContext(visualElement.parent) || {} : {};
    if (visualElement.props.initial !== void 0) {
      context2.initial = visualElement.props.initial;
    }
    return context2;
  }
  const context = {};
  for (let i = 0; i < numVariantProps; i++) {
    const name = variantProps[i];
    const prop = visualElement.props[name];
    if (isVariantLabel(prop) || prop === false) {
      context[name] = prop;
    }
  }
  return context;
}

// node_modules/motion-dom/dist/es/render/utils/shallow-compare.mjs
function shallowCompare(next, prev) {
  if (!Array.isArray(prev))
    return false;
  const prevLength = prev.length;
  if (prevLength !== next.length)
    return false;
  for (let i = 0; i < prevLength; i++) {
    if (prev[i] !== next[i])
      return false;
  }
  return true;
}

// node_modules/motion-dom/dist/es/render/utils/animation-state.mjs
var reversePriorityOrder = [...variantPriorityOrder].reverse();
var numAnimationTypes = variantPriorityOrder.length;
function createAnimateFunction(visualElement) {
  return (animations2) => {
    return Promise.all(animations2.map(({ animation, options }) => animateVisualElement(visualElement, animation, options)));
  };
}
function createAnimationState(visualElement) {
  let animate = createAnimateFunction(visualElement);
  let state = createState();
  let isInitialRender = true;
  let wasReset = false;
  const buildResolvedTypeValues = (type) => (acc, definition) => {
    const resolved = resolveVariant(visualElement, definition, type === "exit" ? visualElement.presenceContext?.custom : void 0);
    if (resolved) {
      const { transition, transitionEnd, ...target } = resolved;
      acc = { ...acc, ...target, ...transitionEnd };
    }
    return acc;
  };
  function setAnimateFunction(makeAnimator) {
    animate = makeAnimator(visualElement);
  }
  function animateChanges(changedActiveType) {
    const { props } = visualElement;
    const context = getVariantContext(visualElement.parent) || {};
    const animations2 = [];
    const removedKeys = /* @__PURE__ */ new Set();
    let encounteredKeys = {};
    let removedVariantIndex = Infinity;
    for (let i = 0; i < numAnimationTypes; i++) {
      const type = reversePriorityOrder[i];
      const typeState = state[type];
      const prop = props[type] !== void 0 ? props[type] : context[type];
      const propIsVariant = isVariantLabel(prop);
      const activeDelta = type === changedActiveType ? typeState.isActive : null;
      if (activeDelta === false)
        removedVariantIndex = i;
      let isInherited = prop === context[type] && prop !== props[type] && propIsVariant;
      if (isInherited && (isInitialRender || wasReset) && visualElement.manuallyAnimateOnMount) {
        isInherited = false;
      }
      typeState.protectedKeys = { ...encounteredKeys };
      if (
        // If it isn't active and hasn't *just* been set as inactive
        !typeState.isActive && activeDelta === null || // If we didn't and don't have any defined prop for this animation type
        !prop && !typeState.prevProp || // Or if the prop doesn't define an animation
        isAnimationControls(prop) || typeof prop === "boolean"
      ) {
        continue;
      }
      if (type === "exit" && typeState.isActive && activeDelta !== true) {
        if (typeState.prevResolvedValues) {
          encounteredKeys = {
            ...encounteredKeys,
            ...typeState.prevResolvedValues
          };
        }
        continue;
      }
      const variantDidChange = checkVariantsDidChange(typeState.prevProp, prop);
      let shouldAnimateType = variantDidChange || // If we're making this variant active, we want to always make it active
      type === changedActiveType && typeState.isActive && !isInherited && propIsVariant || // If we removed a higher-priority variant (i is in reverse order)
      i > removedVariantIndex && propIsVariant;
      let handledRemovedValues = false;
      const definitionList = Array.isArray(prop) ? prop : [prop];
      let resolvedValues = definitionList.reduce(buildResolvedTypeValues(type), {});
      if (activeDelta === false)
        resolvedValues = {};
      const { prevResolvedValues = {} } = typeState;
      const allKeys = {
        ...prevResolvedValues,
        ...resolvedValues
      };
      const markToAnimate = (key) => {
        shouldAnimateType = true;
        if (removedKeys.has(key)) {
          handledRemovedValues = true;
          removedKeys.delete(key);
        }
        typeState.needsAnimating[key] = true;
        const motionValue2 = visualElement.getValue(key);
        if (motionValue2)
          motionValue2.liveStyle = false;
      };
      for (const key in allKeys) {
        const next = resolvedValues[key];
        const prev = prevResolvedValues[key];
        if (encounteredKeys.hasOwnProperty(key))
          continue;
        let valueHasChanged = false;
        if (isKeyframesTarget(next) && isKeyframesTarget(prev)) {
          valueHasChanged = !shallowCompare(next, prev) || variantDidChange;
        } else {
          valueHasChanged = next !== prev;
        }
        if (valueHasChanged) {
          if (next !== void 0 && next !== null) {
            markToAnimate(key);
          } else {
            removedKeys.add(key);
          }
        } else if (next !== void 0 && removedKeys.has(key)) {
          markToAnimate(key);
        } else {
          typeState.protectedKeys[key] = true;
        }
      }
      typeState.prevProp = prop;
      typeState.prevResolvedValues = resolvedValues;
      if (typeState.isActive) {
        encounteredKeys = { ...encounteredKeys, ...resolvedValues };
      }
      if ((isInitialRender || wasReset) && visualElement.blockInitialAnimation) {
        shouldAnimateType = false;
      }
      const willAnimateViaParent = isInherited && variantDidChange;
      const needsAnimating = !willAnimateViaParent || handledRemovedValues;
      if (shouldAnimateType && needsAnimating) {
        animations2.push(...definitionList.map((animation) => {
          const options = { type };
          if (typeof animation === "string" && (isInitialRender || wasReset) && !willAnimateViaParent && visualElement.manuallyAnimateOnMount && visualElement.parent) {
            const { parent } = visualElement;
            const parentVariant = resolveVariant(parent, animation);
            if (parent.enteringChildren && parentVariant) {
              const { delayChildren } = parentVariant.transition || {};
              options.delay = calcChildStagger(parent.enteringChildren, visualElement, delayChildren);
            }
          }
          return {
            animation,
            options
          };
        }));
      }
    }
    if (removedKeys.size) {
      const fallbackAnimation = {};
      if (typeof props.initial !== "boolean") {
        const initialTransition = resolveVariant(visualElement, Array.isArray(props.initial) ? props.initial[0] : props.initial);
        if (initialTransition && initialTransition.transition) {
          fallbackAnimation.transition = initialTransition.transition;
        }
      }
      removedKeys.forEach((key) => {
        const fallbackTarget = visualElement.getBaseTarget(key);
        const motionValue2 = visualElement.getValue(key);
        if (motionValue2)
          motionValue2.liveStyle = true;
        fallbackAnimation[key] = fallbackTarget ?? null;
      });
      animations2.push({ animation: fallbackAnimation });
    }
    let shouldAnimate = Boolean(animations2.length);
    if (isInitialRender && (props.initial === false || props.initial === props.animate) && !visualElement.manuallyAnimateOnMount) {
      shouldAnimate = false;
    }
    isInitialRender = false;
    wasReset = false;
    return shouldAnimate ? animate(animations2) : Promise.resolve();
  }
  function setActive(type, isActive) {
    if (state[type].isActive === isActive)
      return Promise.resolve();
    visualElement.variantChildren?.forEach((child) => child.animationState?.setActive(type, isActive));
    state[type].isActive = isActive;
    const animations2 = animateChanges(type);
    for (const key in state) {
      state[key].protectedKeys = {};
    }
    return animations2;
  }
  return {
    animateChanges,
    setActive,
    setAnimateFunction,
    getState: () => state,
    reset: () => {
      state = createState();
      wasReset = true;
    }
  };
}
function checkVariantsDidChange(prev, next) {
  if (typeof next === "string") {
    return next !== prev;
  } else if (Array.isArray(next)) {
    return !shallowCompare(next, prev);
  }
  return false;
}
function createTypeState(isActive = false) {
  return {
    isActive,
    protectedKeys: {},
    needsAnimating: {},
    prevResolvedValues: {}
  };
}
function createState() {
  return {
    animate: createTypeState(true),
    whileInView: createTypeState(),
    whileHover: createTypeState(),
    whileTap: createTypeState(),
    whileDrag: createTypeState(),
    whileFocus: createTypeState(),
    exit: createTypeState()
  };
}

// node_modules/motion-dom/dist/es/projection/geometry/copy.mjs
function copyAxisInto(axis, originAxis) {
  axis.min = originAxis.min;
  axis.max = originAxis.max;
}
function copyBoxInto(box, originBox) {
  copyAxisInto(box.x, originBox.x);
  copyAxisInto(box.y, originBox.y);
}
function copyAxisDeltaInto(delta, originDelta) {
  delta.translate = originDelta.translate;
  delta.scale = originDelta.scale;
  delta.originPoint = originDelta.originPoint;
  delta.origin = originDelta.origin;
}

// node_modules/motion-dom/dist/es/projection/geometry/delta-calc.mjs
var SCALE_PRECISION = 1e-4;
var SCALE_MIN = 1 - SCALE_PRECISION;
var SCALE_MAX = 1 + SCALE_PRECISION;
var TRANSLATE_PRECISION = 0.01;
var TRANSLATE_MIN = 0 - TRANSLATE_PRECISION;
var TRANSLATE_MAX = 0 + TRANSLATE_PRECISION;
function calcLength(axis) {
  return axis.max - axis.min;
}
function isNear(value, target, maxDistance) {
  return Math.abs(value - target) <= maxDistance;
}
function calcAxisDelta(delta, source, target, origin = 0.5) {
  delta.origin = origin;
  delta.originPoint = mixNumber(source.min, source.max, delta.origin);
  delta.scale = calcLength(target) / calcLength(source);
  delta.translate = mixNumber(target.min, target.max, delta.origin) - delta.originPoint;
  if (delta.scale >= SCALE_MIN && delta.scale <= SCALE_MAX || isNaN(delta.scale)) {
    delta.scale = 1;
  }
  if (delta.translate >= TRANSLATE_MIN && delta.translate <= TRANSLATE_MAX || isNaN(delta.translate)) {
    delta.translate = 0;
  }
}
function calcBoxDelta(delta, source, target, origin) {
  calcAxisDelta(delta.x, source.x, target.x, origin ? origin.originX : void 0);
  calcAxisDelta(delta.y, source.y, target.y, origin ? origin.originY : void 0);
}
function calcRelativeAxis(target, relative, parent, anchor = 0) {
  const anchorPoint = anchor ? mixNumber(parent.min, parent.max, anchor) : parent.min;
  target.min = anchorPoint + relative.min;
  target.max = target.min + calcLength(relative);
}
function calcRelativeBox(target, relative, parent, anchor) {
  calcRelativeAxis(target.x, relative.x, parent.x, anchor?.x);
  calcRelativeAxis(target.y, relative.y, parent.y, anchor?.y);
}
function calcRelativeAxisPosition(target, layout2, parent, anchor = 0) {
  const anchorPoint = anchor ? mixNumber(parent.min, parent.max, anchor) : parent.min;
  target.min = layout2.min - anchorPoint;
  target.max = target.min + calcLength(layout2);
}
function calcRelativePosition(target, layout2, parent, anchor) {
  calcRelativeAxisPosition(target.x, layout2.x, parent.x, anchor?.x);
  calcRelativeAxisPosition(target.y, layout2.y, parent.y, anchor?.y);
}

// node_modules/motion-dom/dist/es/projection/geometry/delta-remove.mjs
function removePointDelta(point, translate, scale2, originPoint, boxScale) {
  point -= translate;
  point = scalePoint(point, 1 / scale2, originPoint);
  if (boxScale !== void 0) {
    point = scalePoint(point, 1 / boxScale, originPoint);
  }
  return point;
}
function removeAxisDelta(axis, translate = 0, scale2 = 1, origin = 0.5, boxScale, originAxis = axis, sourceAxis = axis) {
  if (percent.test(translate)) {
    translate = parseFloat(translate);
    const relativeProgress = mixNumber(sourceAxis.min, sourceAxis.max, translate / 100);
    translate = relativeProgress - sourceAxis.min;
  }
  if (typeof translate !== "number")
    return;
  let originPoint = mixNumber(originAxis.min, originAxis.max, origin);
  if (axis === originAxis)
    originPoint -= translate;
  axis.min = removePointDelta(axis.min, translate, scale2, originPoint, boxScale);
  axis.max = removePointDelta(axis.max, translate, scale2, originPoint, boxScale);
}
function removeAxisTransforms(axis, transforms, [key, scaleKey, originKey], origin, sourceAxis) {
  removeAxisDelta(axis, transforms[key], transforms[scaleKey], transforms[originKey], transforms.scale, origin, sourceAxis);
}
var xKeys = ["x", "scaleX", "originX"];
var yKeys = ["y", "scaleY", "originY"];
function removeBoxTransforms(box, transforms, originBox, sourceBox) {
  removeAxisTransforms(box.x, transforms, xKeys, originBox ? originBox.x : void 0, sourceBox ? sourceBox.x : void 0);
  removeAxisTransforms(box.y, transforms, yKeys, originBox ? originBox.y : void 0, sourceBox ? sourceBox.y : void 0);
}

// node_modules/motion-dom/dist/es/projection/geometry/utils.mjs
function isAxisDeltaZero(delta) {
  return delta.translate === 0 && delta.scale === 1;
}
function isDeltaZero(delta) {
  return isAxisDeltaZero(delta.x) && isAxisDeltaZero(delta.y);
}
function axisEquals(a, b) {
  return a.min === b.min && a.max === b.max;
}
function boxEquals(a, b) {
  return axisEquals(a.x, b.x) && axisEquals(a.y, b.y);
}
function axisEqualsRounded(a, b) {
  return Math.round(a.min) === Math.round(b.min) && Math.round(a.max) === Math.round(b.max);
}
function boxEqualsRounded(a, b) {
  return axisEqualsRounded(a.x, b.x) && axisEqualsRounded(a.y, b.y);
}
function aspectRatio(box) {
  return calcLength(box.x) / calcLength(box.y);
}
function axisDeltaEquals(a, b) {
  return a.translate === b.translate && a.scale === b.scale && a.originPoint === b.originPoint;
}

// node_modules/motion-dom/dist/es/projection/utils/each-axis.mjs
function eachAxis(callback) {
  return [callback("x"), callback("y")];
}

// node_modules/motion-dom/dist/es/projection/styles/transform.mjs
function buildProjectionTransform(delta, treeScale, latestTransform) {
  let transform = "";
  const xTranslate = delta.x.translate / treeScale.x;
  const yTranslate = delta.y.translate / treeScale.y;
  const zTranslate = latestTransform?.z || 0;
  if (xTranslate || yTranslate || zTranslate) {
    transform = `translate3d(${xTranslate}px, ${yTranslate}px, ${zTranslate}px) `;
  }
  if (treeScale.x !== 1 || treeScale.y !== 1) {
    transform += `scale(${1 / treeScale.x}, ${1 / treeScale.y}) `;
  }
  if (latestTransform) {
    const { transformPerspective, rotate: rotate2, pathRotation, rotateX, rotateY, skewX, skewY } = latestTransform;
    if (transformPerspective)
      transform = `perspective(${transformPerspective}px) ${transform}`;
    if (rotate2)
      transform += `rotate(${rotate2}deg) `;
    if (pathRotation)
      transform += `rotate(${pathRotation}deg) `;
    if (rotateX)
      transform += `rotateX(${rotateX}deg) `;
    if (rotateY)
      transform += `rotateY(${rotateY}deg) `;
    if (skewX)
      transform += `skewX(${skewX}deg) `;
    if (skewY)
      transform += `skewY(${skewY}deg) `;
  }
  const elementScaleX = delta.x.scale * treeScale.x;
  const elementScaleY = delta.y.scale * treeScale.y;
  if (elementScaleX !== 1 || elementScaleY !== 1) {
    transform += `scale(${elementScaleX}, ${elementScaleY})`;
  }
  return transform || "none";
}

// node_modules/motion-dom/dist/es/projection/animation/mix-values.mjs
var numBorders = cornerRadiusProps.length;
var asNumber = (value) => typeof value === "string" ? parseFloat(value) : value;
var isPx = (value) => typeof value === "number" || px.test(value);
function mixValues(target, follow, lead, progress2, shouldCrossfadeOpacity, isOnlyMember) {
  if (shouldCrossfadeOpacity) {
    target.opacity = mixNumber(0, lead.opacity ?? 1, easeCrossfadeIn(progress2));
    target.opacityExit = mixNumber(follow.opacity ?? 1, 0, easeCrossfadeOut(progress2));
  } else if (isOnlyMember) {
    target.opacity = mixNumber(follow.opacity ?? 1, lead.opacity ?? 1, progress2);
  }
  for (let i = 0; i < numBorders; i++) {
    const borderLabel = cornerRadiusProps[i];
    let followRadius = getRadius(follow, borderLabel);
    let leadRadius = getRadius(lead, borderLabel);
    if (followRadius === void 0 && leadRadius === void 0)
      continue;
    followRadius || (followRadius = 0);
    leadRadius || (leadRadius = 0);
    const canMix = followRadius === 0 || leadRadius === 0 || isPx(followRadius) === isPx(leadRadius);
    if (canMix) {
      target[borderLabel] = Math.max(mixNumber(asNumber(followRadius), asNumber(leadRadius), progress2), 0);
      if (percent.test(leadRadius) || percent.test(followRadius)) {
        target[borderLabel] += "%";
      }
    } else {
      target[borderLabel] = leadRadius;
    }
  }
  if (follow.rotate || lead.rotate) {
    target.rotate = mixNumber(follow.rotate || 0, lead.rotate || 0, progress2);
  }
}
function getRadius(values, radiusName) {
  return values[radiusName] !== void 0 ? values[radiusName] : values.borderRadius;
}
var easeCrossfadeIn = /* @__PURE__ */ compress(0, 0.5, circOut);
var easeCrossfadeOut = /* @__PURE__ */ compress(0.5, 0.95, noop);
function compress(min, max, easing) {
  return (p) => {
    if (p < min)
      return 0;
    if (p > max)
      return 1;
    return easing(progress(min, max, p));
  };
}

// node_modules/motion-dom/dist/es/animation/animate/single-value.mjs
function animateSingleValue(value, keyframes2, options) {
  const motionValue$1 = isMotionValue(value) ? value : motionValue(value);
  motionValue$1.start(animateMotionValue("", motionValue$1, keyframes2, options));
  return motionValue$1.animation;
}

// node_modules/motion-dom/dist/es/events/add-dom-event.mjs
function addDomEvent(target, eventName, handler, options = { passive: true }) {
  target.addEventListener(eventName, handler, options);
  return () => target.removeEventListener(eventName, handler, options);
}

// node_modules/motion-dom/dist/es/projection/utils/compare-by-depth.mjs
var compareByDepth = (a, b) => a.depth - b.depth;

// node_modules/motion-dom/dist/es/projection/utils/flat-tree.mjs
var FlatTree = class {
  constructor() {
    this.children = [];
    this.isDirty = false;
  }
  add(child) {
    addUniqueItem(this.children, child);
    this.isDirty = true;
  }
  remove(child) {
    removeItem(this.children, child);
    this.isDirty = true;
  }
  forEach(callback) {
    this.isDirty && this.children.sort(compareByDepth);
    this.isDirty = false;
    this.children.forEach(callback);
  }
};

// node_modules/motion-dom/dist/es/utils/delay.mjs
function delay(callback, timeout) {
  const start = time.now();
  const checkElapsed = ({ timestamp }) => {
    const elapsed = timestamp - start;
    if (elapsed >= timeout) {
      cancelFrame(checkElapsed);
      callback(elapsed - timeout);
    }
  };
  frame.setup(checkElapsed, true);
  return () => cancelFrame(checkElapsed);
}

// node_modules/motion-dom/dist/es/value/utils/resolve-motion-value.mjs
function resolveMotionValue(value) {
  return isMotionValue(value) ? value.get() : value;
}

// node_modules/motion-dom/dist/es/projection/shared/stack.mjs
var NodeStack = class {
  constructor() {
    this.members = [];
  }
  add(node) {
    addUniqueItem(this.members, node);
    for (let i = this.members.length - 1; i >= 0; i--) {
      const member = this.members[i];
      if (member === node || member === this.lead || member === this.prevLead)
        continue;
      const inst = member.instance;
      if ((!inst || inst.isConnected === false) && !member.snapshot) {
        removeItem(this.members, member);
        member.unmount();
      }
    }
    node.scheduleRender();
  }
  remove(node) {
    removeItem(this.members, node);
    if (node === this.prevLead)
      this.prevLead = void 0;
    if (node === this.lead) {
      const prevLead = this.members[this.members.length - 1];
      if (prevLead)
        this.promote(prevLead);
    }
  }
  relegate(node) {
    for (let i = this.members.indexOf(node) - 1; i >= 0; i--) {
      const member = this.members[i];
      if (member.isPresent !== false && member.instance?.isConnected !== false) {
        this.promote(member);
        return true;
      }
    }
    return false;
  }
  promote(node, preserveFollowOpacity) {
    const prevLead = this.lead;
    if (node === prevLead)
      return;
    this.prevLead = prevLead;
    this.lead = node;
    node.show();
    if (prevLead) {
      prevLead.updateSnapshot();
      node.scheduleRender();
      const { layoutDependency: prevDep } = prevLead.options;
      const { layoutDependency: nextDep } = node.options;
      if (prevDep === void 0 || prevDep !== nextDep) {
        node.resumeFrom = prevLead;
        if (preserveFollowOpacity)
          prevLead.preserveOpacity = true;
        if (prevLead.snapshot) {
          node.snapshot = prevLead.snapshot;
          node.snapshot.latestValues = prevLead.animationValues || prevLead.latestValues;
        }
        if (node.root?.isUpdating)
          node.isLayoutDirty = true;
      }
      if (node.options.crossfade === false)
        prevLead.hide();
    }
  }
  exitAnimationComplete() {
    this.members.forEach((member) => {
      member.options.onExitComplete?.();
      member.resumingFrom?.options.onExitComplete?.();
    });
  }
  scheduleRender() {
    this.members.forEach((member) => member.instance && member.scheduleRender(false));
  }
  removeLeadSnapshot() {
    if (this.lead?.snapshot)
      this.lead.snapshot = void 0;
  }
};

// node_modules/motion-dom/dist/es/projection/node/state.mjs
var globalProjectionState = {
  /**
   * Global flag as to whether the tree has animated since the last time
   * we resized the window
   */
  hasAnimatedSinceResize: true,
  /**
   * We set this to true once, on the first update. Any nodes added to the tree beyond that
   * update will be given a `data-projection-id` attribute.
   */
  hasEverUpdated: false
};

// node_modules/motion-dom/dist/es/projection/node/create-projection-node.mjs
var metrics = {
  nodes: 0,
  calculatedTargetDeltas: 0,
  calculatedProjections: 0
};
var transformAxes = ["", "X", "Y", "Z"];
var animationTarget = 1e3;
var id = 0;
function resetDistortingTransform(key, visualElement, values, sharedAnimationValues) {
  const { latestValues } = visualElement;
  if (latestValues[key]) {
    values[key] = latestValues[key];
    visualElement.setStaticValue(key, 0);
    if (sharedAnimationValues) {
      sharedAnimationValues[key] = 0;
    }
  }
}
function cancelTreeOptimisedTransformAnimations(projectionNode) {
  projectionNode.hasCheckedOptimisedAppear = true;
  if (projectionNode.root === projectionNode)
    return;
  const { visualElement } = projectionNode.options;
  if (!visualElement)
    return;
  const appearId = getOptimisedAppearId(visualElement);
  if (window.MotionHasOptimisedAnimation(appearId, "transform")) {
    const { layout: layout2, layoutId } = projectionNode.options;
    window.MotionCancelOptimisedAnimation(appearId, "transform", frame, !(layout2 || layoutId));
  }
  const { parent } = projectionNode;
  if (parent && !parent.hasCheckedOptimisedAppear) {
    cancelTreeOptimisedTransformAnimations(parent);
  }
}
function createProjectionNode({ attachResizeListener, defaultParent, measureScroll, checkIsScrollRoot, resetTransform }) {
  return class ProjectionNode {
    constructor(latestValues = {}, parent = defaultParent?.()) {
      this.id = id++;
      this.animationId = 0;
      this.animationCommitId = 0;
      this.children = /* @__PURE__ */ new Set();
      this.options = {};
      this.isTreeAnimating = false;
      this.isAnimationBlocked = false;
      this.isLayoutDirty = false;
      this.isProjectionDirty = false;
      this.isSharedProjectionDirty = false;
      this.isTransformDirty = false;
      this.updateManuallyBlocked = false;
      this.updateBlockedByResize = false;
      this.isUpdating = false;
      this.isSVG = false;
      this.needsReset = false;
      this.shouldResetTransform = false;
      this.hasCheckedOptimisedAppear = false;
      this.treeScale = { x: 1, y: 1 };
      this.eventHandlers = /* @__PURE__ */ new Map();
      this.hasTreeAnimated = false;
      this.layoutVersion = 0;
      this.updateScheduled = false;
      this.scheduleUpdate = () => this.update();
      this.projectionUpdateScheduled = false;
      this.checkUpdateFailed = () => {
        if (this.isUpdating) {
          this.isUpdating = false;
          this.clearAllSnapshots();
        }
      };
      this.updateProjection = () => {
        this.projectionUpdateScheduled = false;
        if (statsBuffer.value) {
          metrics.nodes = metrics.calculatedTargetDeltas = metrics.calculatedProjections = 0;
        }
        this.nodes.forEach(propagateDirtyNodes);
        this.nodes.forEach(resolveTargetDelta);
        this.nodes.forEach(calcProjection);
        this.nodes.forEach(cleanDirtyNodes);
        if (statsBuffer.addProjectionMetrics) {
          statsBuffer.addProjectionMetrics(metrics);
        }
      };
      this.resolvedRelativeTargetAt = 0;
      this.linkedParentVersion = 0;
      this.hasProjected = false;
      this.isVisible = true;
      this.animationProgress = 0;
      this.sharedNodes = /* @__PURE__ */ new Map();
      this.latestValues = latestValues;
      this.root = parent ? parent.root || parent : this;
      this.path = parent ? [...parent.path, parent] : [];
      this.parent = parent;
      this.depth = parent ? parent.depth + 1 : 0;
      for (let i = 0; i < this.path.length; i++) {
        this.path[i].shouldResetTransform = true;
      }
      if (this.root === this)
        this.nodes = new FlatTree();
    }
    addEventListener(name, handler) {
      if (!this.eventHandlers.has(name)) {
        this.eventHandlers.set(name, new SubscriptionManager());
      }
      return this.eventHandlers.get(name).add(handler);
    }
    notifyListeners(name, ...args) {
      const subscriptionManager = this.eventHandlers.get(name);
      subscriptionManager && subscriptionManager.notify(...args);
    }
    hasListeners(name) {
      return this.eventHandlers.has(name);
    }
    /**
     * Lifecycles
     */
    mount(instance) {
      if (this.instance)
        return;
      this.isSVG = isSVGElement(instance) && !isSVGSVGElement(instance);
      this.instance = instance;
      const { layoutId, layout: layout2, visualElement } = this.options;
      if (visualElement && !visualElement.current) {
        visualElement.mount(instance);
      }
      this.root.nodes.add(this);
      this.parent && this.parent.children.add(this);
      if (this.root.hasTreeAnimated && (layout2 || layoutId)) {
        this.isLayoutDirty = true;
      }
      if (attachResizeListener) {
        let cancelDelay;
        let innerWidth = 0;
        const resizeUnblockUpdate = () => this.root.updateBlockedByResize = false;
        frame.read(() => {
          innerWidth = window.innerWidth;
        });
        attachResizeListener(instance, () => {
          const newInnerWidth = window.innerWidth;
          if (newInnerWidth === innerWidth)
            return;
          innerWidth = newInnerWidth;
          this.root.updateBlockedByResize = true;
          cancelDelay && cancelDelay();
          cancelDelay = delay(resizeUnblockUpdate, 250);
          if (globalProjectionState.hasAnimatedSinceResize) {
            globalProjectionState.hasAnimatedSinceResize = false;
            this.nodes.forEach(finishAnimation);
          }
        });
      }
      if (layoutId) {
        this.root.registerSharedNode(layoutId, this);
      }
      if (this.options.animate !== false && visualElement && (layoutId || layout2)) {
        this.addEventListener("didUpdate", ({ delta, hasLayoutChanged, hasRelativeLayoutChanged, layout: newLayout }) => {
          if (this.isTreeAnimationBlocked()) {
            this.target = void 0;
            this.relativeTarget = void 0;
            return;
          }
          const layoutTransition = this.options.transition || visualElement.getDefaultTransition() || defaultLayoutTransition;
          const { onLayoutAnimationStart, onLayoutAnimationComplete } = visualElement.getProps();
          const hasTargetChanged = !this.targetLayout || !boxEqualsRounded(this.targetLayout, newLayout);
          const hasOnlyRelativeTargetChanged = !hasLayoutChanged && hasRelativeLayoutChanged;
          if (this.options.layoutRoot || this.resumeFrom || hasOnlyRelativeTargetChanged || hasLayoutChanged && (hasTargetChanged || !this.currentAnimation)) {
            if (this.resumeFrom) {
              this.resumingFrom = this.resumeFrom;
              this.resumingFrom.resumingFrom = void 0;
            }
            const animationOptions = {
              ...getValueTransition(layoutTransition, "layout"),
              onPlay: onLayoutAnimationStart,
              onComplete: onLayoutAnimationComplete
            };
            if (visualElement.shouldReduceMotion || this.options.layoutRoot) {
              animationOptions.delay = 0;
              animationOptions.type = false;
            }
            this.startAnimation(animationOptions);
            this.setAnimationOrigin(delta, hasOnlyRelativeTargetChanged, animationOptions.path);
          } else {
            if (!hasLayoutChanged) {
              finishAnimation(this);
            }
            if (this.isLead() && this.options.onExitComplete) {
              this.options.onExitComplete();
            }
          }
          this.targetLayout = newLayout;
        });
      }
    }
    unmount() {
      this.options.layoutId && this.willUpdate();
      this.root.nodes.remove(this);
      const stack = this.getStack();
      stack && stack.remove(this);
      this.parent && this.parent.children.delete(this);
      this.instance = void 0;
      this.eventHandlers.clear();
      cancelFrame(this.updateProjection);
    }
    // only on the root
    blockUpdate() {
      this.updateManuallyBlocked = true;
    }
    unblockUpdate() {
      this.updateManuallyBlocked = false;
    }
    isUpdateBlocked() {
      return this.updateManuallyBlocked || this.updateBlockedByResize;
    }
    isTreeAnimationBlocked() {
      return this.isAnimationBlocked || this.parent && this.parent.isTreeAnimationBlocked() || false;
    }
    // Note: currently only running on root node
    startUpdate() {
      if (this.isUpdateBlocked())
        return;
      this.isUpdating = true;
      this.nodes && this.nodes.forEach(resetSkewAndRotation);
      this.animationId++;
    }
    getTransformTemplate() {
      const { visualElement } = this.options;
      return visualElement && visualElement.getProps().transformTemplate;
    }
    willUpdate(shouldNotifyListeners = true) {
      this.root.hasTreeAnimated = true;
      if (this.root.isUpdateBlocked()) {
        this.options.onExitComplete && this.options.onExitComplete();
        return;
      }
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear) {
        cancelTreeOptimisedTransformAnimations(this);
      }
      !this.root.isUpdating && this.root.startUpdate();
      if (this.isLayoutDirty)
        return;
      this.isLayoutDirty = true;
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        node.shouldResetTransform = true;
        if (typeof node.latestValues.x === "string" || typeof node.latestValues.y === "string") {
          node.isLayoutDirty = true;
        }
        node.updateScroll("snapshot");
        if (node.options.layoutRoot) {
          node.willUpdate(false);
        }
      }
      const { layoutId, layout: layout2 } = this.options;
      if (layoutId === void 0 && !layout2)
        return;
      const transformTemplate = this.getTransformTemplate();
      this.prevTransformTemplateValue = transformTemplate ? transformTemplate(this.latestValues, "") : void 0;
      this.updateSnapshot();
      shouldNotifyListeners && this.notifyListeners("willUpdate");
    }
    update() {
      this.updateScheduled = false;
      const updateWasBlocked = this.isUpdateBlocked();
      if (updateWasBlocked) {
        const wasBlockedByResize = this.updateBlockedByResize;
        this.unblockUpdate();
        this.updateBlockedByResize = false;
        this.clearAllSnapshots();
        if (wasBlockedByResize) {
          this.nodes.forEach(forceLayoutMeasure);
        }
        this.nodes.forEach(clearMeasurements);
        return;
      }
      if (this.animationId <= this.animationCommitId) {
        this.nodes.forEach(clearIsLayoutDirty);
        return;
      }
      this.animationCommitId = this.animationId;
      if (!this.isUpdating) {
        this.nodes.forEach(clearIsLayoutDirty);
      } else {
        this.isUpdating = false;
        this.nodes.forEach(ensureDraggedNodesSnapshotted);
        this.nodes.forEach(resetTransformStyle);
        this.nodes.forEach(updateLayout);
        this.nodes.forEach(notifyLayoutUpdate);
      }
      this.clearAllSnapshots();
      const now2 = time.now();
      frameData.delta = clamp(0, 1e3 / 60, now2 - frameData.timestamp);
      frameData.timestamp = now2;
      frameData.isProcessing = true;
      frameSteps.update.process(frameData);
      frameSteps.preRender.process(frameData);
      frameSteps.render.process(frameData);
      frameData.isProcessing = false;
    }
    didUpdate() {
      if (!this.updateScheduled) {
        this.updateScheduled = true;
        microtask.read(this.scheduleUpdate);
      }
    }
    clearAllSnapshots() {
      this.nodes.forEach(clearSnapshot);
      this.sharedNodes.forEach(removeLeadSnapshots);
    }
    scheduleUpdateProjection() {
      if (!this.projectionUpdateScheduled) {
        this.projectionUpdateScheduled = true;
        frame.preRender(this.updateProjection, false, true);
      }
    }
    scheduleCheckAfterUnmount() {
      frame.postRender(() => {
        if (this.isLayoutDirty) {
          this.root.didUpdate();
        } else {
          this.root.checkUpdateFailed();
        }
      });
    }
    /**
     * Update measurements
     */
    updateSnapshot() {
      if (this.snapshot || !this.instance)
        return;
      this.snapshot = this.measure();
      if (this.snapshot && !calcLength(this.snapshot.measuredBox.x) && !calcLength(this.snapshot.measuredBox.y)) {
        this.snapshot = void 0;
      }
    }
    updateLayout() {
      if (!this.instance)
        return;
      this.updateScroll();
      if (!(this.options.alwaysMeasureLayout && this.isLead()) && !this.isLayoutDirty) {
        return;
      }
      if (this.resumeFrom && !this.resumeFrom.instance) {
        for (let i = 0; i < this.path.length; i++) {
          const node = this.path[i];
          node.updateScroll();
        }
      }
      const prevLayout = this.layout;
      this.layout = this.measure(false);
      this.layoutVersion++;
      if (!this.layoutCorrected)
        this.layoutCorrected = createBox();
      this.isLayoutDirty = false;
      this.projectionDelta = void 0;
      this.notifyListeners("measure", this.layout.layoutBox);
      const { visualElement } = this.options;
      visualElement && visualElement.notify("LayoutMeasure", this.layout.layoutBox, prevLayout ? prevLayout.layoutBox : void 0);
    }
    updateScroll(phase = "measure") {
      let needsMeasurement = Boolean(this.options.layoutScroll && this.instance);
      if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === phase) {
        needsMeasurement = false;
      }
      if (needsMeasurement && this.instance) {
        const isRoot = checkIsScrollRoot(this.instance);
        this.scroll = {
          animationId: this.root.animationId,
          phase,
          isRoot,
          offset: measureScroll(this.instance),
          wasRoot: this.scroll ? this.scroll.isRoot : isRoot
        };
      }
    }
    resetTransform() {
      if (!resetTransform)
        return;
      const isResetRequested = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout;
      const hasProjection = this.projectionDelta && !isDeltaZero(this.projectionDelta);
      const transformTemplate = this.getTransformTemplate();
      const transformTemplateValue = transformTemplate ? transformTemplate(this.latestValues, "") : void 0;
      const transformTemplateHasChanged = transformTemplateValue !== this.prevTransformTemplateValue;
      if (isResetRequested && this.instance && (hasProjection || hasTransform(this.latestValues) || transformTemplateHasChanged)) {
        resetTransform(this.instance, transformTemplateValue);
        this.shouldResetTransform = false;
        this.scheduleRender();
      }
    }
    measure(removeTransform = true) {
      const pageBox = this.measurePageBox();
      let layoutBox = this.removeElementScroll(pageBox);
      if (removeTransform) {
        layoutBox = this.removeTransform(layoutBox);
      }
      roundBox(layoutBox);
      return {
        animationId: this.root.animationId,
        measuredBox: pageBox,
        layoutBox,
        latestValues: {},
        source: this.id
      };
    }
    measurePageBox() {
      const { visualElement } = this.options;
      if (!visualElement)
        return createBox();
      const box = visualElement.measureViewportBox();
      const wasInScrollRoot = this.scroll?.wasRoot || this.path.some(checkNodeWasScrollRoot);
      if (!wasInScrollRoot) {
        const { scroll } = this.root;
        if (scroll) {
          translateAxis(box.x, scroll.offset.x);
          translateAxis(box.y, scroll.offset.y);
        }
      }
      return box;
    }
    removeElementScroll(box) {
      const boxWithoutScroll = createBox();
      copyBoxInto(boxWithoutScroll, box);
      if (this.scroll?.wasRoot) {
        return boxWithoutScroll;
      }
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        const { scroll, options } = node;
        if (node !== this.root && scroll && options.layoutScroll) {
          if (scroll.wasRoot) {
            copyBoxInto(boxWithoutScroll, box);
          }
          translateAxis(boxWithoutScroll.x, scroll.offset.x);
          translateAxis(boxWithoutScroll.y, scroll.offset.y);
        }
      }
      return boxWithoutScroll;
    }
    applyTransform(box, transformOnly = false, output) {
      const withTransforms = output || createBox();
      copyBoxInto(withTransforms, box);
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        if (!transformOnly && node.options.layoutScroll && node.scroll && node !== node.root) {
          translateAxis(withTransforms.x, -node.scroll.offset.x);
          translateAxis(withTransforms.y, -node.scroll.offset.y);
        }
        if (!hasTransform(node.latestValues))
          continue;
        transformBox(withTransforms, node.latestValues, node.layout?.layoutBox);
      }
      if (hasTransform(this.latestValues)) {
        transformBox(withTransforms, this.latestValues, this.layout?.layoutBox);
      }
      return withTransforms;
    }
    removeTransform(box) {
      const boxWithoutTransform = createBox();
      copyBoxInto(boxWithoutTransform, box);
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        if (!hasTransform(node.latestValues))
          continue;
        let sourceBox;
        if (node.instance) {
          hasScale(node.latestValues) && node.updateSnapshot();
          sourceBox = createBox();
          copyBoxInto(sourceBox, node.measurePageBox());
        }
        removeBoxTransforms(boxWithoutTransform, node.latestValues, node.snapshot?.layoutBox, sourceBox);
      }
      if (hasTransform(this.latestValues)) {
        removeBoxTransforms(boxWithoutTransform, this.latestValues);
      }
      return boxWithoutTransform;
    }
    setTargetDelta(delta) {
      this.targetDelta = delta;
      this.root.scheduleUpdateProjection();
      this.isProjectionDirty = true;
    }
    setOptions(options) {
      this.options = {
        ...this.options,
        ...options,
        crossfade: options.crossfade !== void 0 ? options.crossfade : true
      };
    }
    clearMeasurements() {
      this.scroll = void 0;
      this.layout = void 0;
      this.snapshot = void 0;
      this.prevTransformTemplateValue = void 0;
      this.targetDelta = void 0;
      this.target = void 0;
      this.isLayoutDirty = false;
    }
    forceRelativeParentToResolveTarget() {
      if (!this.relativeParent)
        return;
      if (this.relativeParent.resolvedRelativeTargetAt !== frameData.timestamp) {
        this.relativeParent.resolveTargetDelta(true);
      }
    }
    resolveTargetDelta(forceRecalculation = false) {
      const lead = this.getLead();
      this.isProjectionDirty || (this.isProjectionDirty = lead.isProjectionDirty);
      this.isTransformDirty || (this.isTransformDirty = lead.isTransformDirty);
      this.isSharedProjectionDirty || (this.isSharedProjectionDirty = lead.isSharedProjectionDirty);
      const isShared = Boolean(this.resumingFrom) || this !== lead;
      const canSkip = !(forceRecalculation || isShared && this.isSharedProjectionDirty || this.isProjectionDirty || this.parent?.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize);
      if (canSkip)
        return;
      const { layout: layout2, layoutId } = this.options;
      if (!this.layout || !(layout2 || layoutId))
        return;
      this.resolvedRelativeTargetAt = frameData.timestamp;
      const relativeParent = this.getClosestProjectingParent();
      if (relativeParent && this.linkedParentVersion !== relativeParent.layoutVersion && !relativeParent.options.layoutRoot) {
        this.removeRelativeTarget();
      }
      if (!this.targetDelta && !this.relativeTarget) {
        if (this.options.layoutAnchor !== false && relativeParent && relativeParent.layout) {
          this.createRelativeTarget(relativeParent, this.layout.layoutBox, relativeParent.layout.layoutBox);
        } else {
          this.removeRelativeTarget();
        }
      }
      if (!this.relativeTarget && !this.targetDelta)
        return;
      if (!this.target) {
        this.target = createBox();
        this.targetWithTransforms = createBox();
      }
      if (this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target) {
        this.forceRelativeParentToResolveTarget();
        calcRelativeBox(this.target, this.relativeTarget, this.relativeParent.target, this.options.layoutAnchor || void 0);
      } else if (this.targetDelta) {
        if (Boolean(this.resumingFrom)) {
          this.applyTransform(this.layout.layoutBox, false, this.target);
        } else {
          copyBoxInto(this.target, this.layout.layoutBox);
        }
        applyBoxDelta(this.target, this.targetDelta);
      } else {
        copyBoxInto(this.target, this.layout.layoutBox);
      }
      if (this.attemptToResolveRelativeTarget) {
        this.attemptToResolveRelativeTarget = false;
        if (this.options.layoutAnchor !== false && relativeParent && Boolean(relativeParent.resumingFrom) === Boolean(this.resumingFrom) && !relativeParent.options.layoutScroll && relativeParent.target && this.animationProgress !== 1) {
          this.createRelativeTarget(relativeParent, this.target, relativeParent.target);
        } else {
          this.relativeParent = this.relativeTarget = void 0;
        }
      }
      if (statsBuffer.value) {
        metrics.calculatedTargetDeltas++;
      }
    }
    getClosestProjectingParent() {
      if (!this.parent || hasScale(this.parent.latestValues) || has2DTranslate(this.parent.latestValues)) {
        return void 0;
      }
      if (this.parent.isProjecting()) {
        return this.parent;
      } else {
        return this.parent.getClosestProjectingParent();
      }
    }
    isProjecting() {
      return Boolean((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
    }
    createRelativeTarget(relativeParent, layout2, parentLayout) {
      this.relativeParent = relativeParent;
      this.linkedParentVersion = relativeParent.layoutVersion;
      this.forceRelativeParentToResolveTarget();
      this.relativeTarget = createBox();
      this.relativeTargetOrigin = createBox();
      calcRelativePosition(this.relativeTargetOrigin, layout2, parentLayout, this.options.layoutAnchor || void 0);
      copyBoxInto(this.relativeTarget, this.relativeTargetOrigin);
    }
    removeRelativeTarget() {
      this.relativeParent = this.relativeTarget = void 0;
    }
    calcProjection() {
      const lead = this.getLead();
      const isShared = Boolean(this.resumingFrom) || this !== lead;
      let canSkip = true;
      if (this.isProjectionDirty || this.parent?.isProjectionDirty) {
        canSkip = false;
      }
      if (isShared && (this.isSharedProjectionDirty || this.isTransformDirty)) {
        canSkip = false;
      }
      if (this.resolvedRelativeTargetAt === frameData.timestamp) {
        canSkip = false;
      }
      if (canSkip)
        return;
      const { layout: layout2, layoutId } = this.options;
      this.isTreeAnimating = Boolean(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation);
      if (!this.isTreeAnimating) {
        this.targetDelta = this.relativeTarget = void 0;
      }
      if (!this.layout || !(layout2 || layoutId))
        return;
      copyBoxInto(this.layoutCorrected, this.layout.layoutBox);
      const prevTreeScaleX = this.treeScale.x;
      const prevTreeScaleY = this.treeScale.y;
      applyTreeDeltas(this.layoutCorrected, this.treeScale, this.path, isShared);
      if (lead.layout && !lead.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1)) {
        lead.target = lead.layout.layoutBox;
        lead.targetWithTransforms = createBox();
      }
      const { target } = lead;
      if (!target) {
        if (this.prevProjectionDelta) {
          this.createProjectionDeltas();
          this.scheduleRender();
        }
        return;
      }
      if (!this.projectionDelta || !this.prevProjectionDelta) {
        this.createProjectionDeltas();
      } else {
        copyAxisDeltaInto(this.prevProjectionDelta.x, this.projectionDelta.x);
        copyAxisDeltaInto(this.prevProjectionDelta.y, this.projectionDelta.y);
      }
      calcBoxDelta(this.projectionDelta, this.layoutCorrected, target, this.latestValues);
      if (this.treeScale.x !== prevTreeScaleX || this.treeScale.y !== prevTreeScaleY || !axisDeltaEquals(this.projectionDelta.x, this.prevProjectionDelta.x) || !axisDeltaEquals(this.projectionDelta.y, this.prevProjectionDelta.y)) {
        this.hasProjected = true;
        this.scheduleRender();
        this.notifyListeners("projectionUpdate", target);
      }
      if (statsBuffer.value) {
        metrics.calculatedProjections++;
      }
    }
    hide() {
      this.isVisible = false;
    }
    show() {
      this.isVisible = true;
    }
    scheduleRender(notifyAll2 = true) {
      this.options.visualElement?.scheduleRender();
      if (notifyAll2) {
        const stack = this.getStack();
        stack && stack.scheduleRender();
      }
      if (this.resumingFrom && !this.resumingFrom.instance) {
        this.resumingFrom = void 0;
      }
    }
    createProjectionDeltas() {
      this.prevProjectionDelta = createDelta();
      this.projectionDelta = createDelta();
      this.projectionDeltaWithTransform = createDelta();
    }
    setAnimationOrigin(delta, hasOnlyRelativeTargetChanged = false, pathFn) {
      const snapshot = this.snapshot;
      const snapshotLatestValues = snapshot ? snapshot.latestValues : {};
      const mixedValues = { ...this.latestValues };
      const targetDelta = createDelta();
      if (!this.relativeParent || !this.relativeParent.options.layoutRoot) {
        this.relativeTarget = this.relativeTargetOrigin = void 0;
      }
      this.attemptToResolveRelativeTarget = !hasOnlyRelativeTargetChanged;
      const relativeLayout = createBox();
      const snapshotSource = snapshot ? snapshot.source : void 0;
      const layoutSource = this.layout ? this.layout.source : void 0;
      const isSharedLayoutAnimation = snapshotSource !== layoutSource;
      const stack = this.getStack();
      const isOnlyMember = !stack || stack.members.length <= 1;
      const shouldCrossfadeOpacity = Boolean(isSharedLayoutAnimation && !isOnlyMember && this.options.crossfade === true && !this.path.some(hasOpacityCrossfade));
      this.animationProgress = 0;
      let prevRelativeTarget;
      const interpolate2 = pathFn?.interpolateProjection(delta);
      this.mixTargetDelta = (latest) => {
        const progress2 = latest / 1e3;
        const point = interpolate2?.(progress2);
        if (point) {
          targetDelta.x.translate = point.x;
          targetDelta.x.scale = mixNumber(delta.x.scale, 1, progress2);
          targetDelta.x.origin = delta.x.origin;
          targetDelta.x.originPoint = delta.x.originPoint;
          targetDelta.y.translate = point.y;
          targetDelta.y.scale = mixNumber(delta.y.scale, 1, progress2);
          targetDelta.y.origin = delta.y.origin;
          targetDelta.y.originPoint = delta.y.originPoint;
        } else {
          mixAxisDeltaLinear(targetDelta.x, delta.x, progress2);
          mixAxisDeltaLinear(targetDelta.y, delta.y, progress2);
        }
        this.setTargetDelta(targetDelta);
        if (this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout) {
          calcRelativePosition(relativeLayout, this.layout.layoutBox, this.relativeParent.layout.layoutBox, this.options.layoutAnchor || void 0);
          mixBox(this.relativeTarget, this.relativeTargetOrigin, relativeLayout, progress2);
          if (prevRelativeTarget && boxEquals(this.relativeTarget, prevRelativeTarget)) {
            this.isProjectionDirty = false;
          }
          if (!prevRelativeTarget)
            prevRelativeTarget = createBox();
          copyBoxInto(prevRelativeTarget, this.relativeTarget);
        }
        if (isSharedLayoutAnimation) {
          this.animationValues = mixedValues;
          mixValues(mixedValues, snapshotLatestValues, this.latestValues, progress2, shouldCrossfadeOpacity, isOnlyMember);
        }
        if (point && point.rotate !== void 0) {
          if (!this.animationValues)
            this.animationValues = mixedValues;
          this.animationValues.pathRotation = point.rotate;
        }
        this.root.scheduleUpdateProjection();
        this.scheduleRender();
        this.animationProgress = progress2;
      };
      this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(options) {
      this.notifyListeners("animationStart");
      this.currentAnimation?.stop();
      this.resumingFrom?.currentAnimation?.stop();
      if (this.pendingAnimation) {
        cancelFrame(this.pendingAnimation);
        this.pendingAnimation = void 0;
      }
      this.pendingAnimation = frame.update(() => {
        globalProjectionState.hasAnimatedSinceResize = true;
        this.motionValue || (this.motionValue = motionValue(0));
        this.motionValue.jump(0, false);
        this.currentAnimation = animateSingleValue(this.motionValue, [0, 1e3], {
          ...options,
          velocity: 0,
          isSync: true,
          onUpdate: (latest) => {
            this.mixTargetDelta(latest);
            options.onUpdate && options.onUpdate(latest);
          },
          onComplete: () => {
            options.onComplete && options.onComplete();
            this.completeAnimation();
          }
        });
        if (this.resumingFrom) {
          this.resumingFrom.currentAnimation = this.currentAnimation;
        }
        this.pendingAnimation = void 0;
      });
    }
    completeAnimation() {
      if (this.resumingFrom) {
        this.resumingFrom.currentAnimation = void 0;
        this.resumingFrom.preserveOpacity = void 0;
      }
      const stack = this.getStack();
      stack && stack.exitAnimationComplete();
      this.resumingFrom = this.currentAnimation = this.animationValues = void 0;
      this.notifyListeners("animationComplete");
    }
    finishAnimation() {
      if (this.currentAnimation) {
        this.mixTargetDelta && this.mixTargetDelta(animationTarget);
        this.currentAnimation.stop();
      }
      this.completeAnimation();
    }
    applyTransformsToTarget() {
      const lead = this.getLead();
      let { targetWithTransforms, target, layout: layout2, latestValues } = lead;
      if (!targetWithTransforms || !target || !layout2)
        return;
      if (this !== lead && this.layout && layout2 && shouldAnimatePositionOnly(this.options.animationType, this.layout.layoutBox, layout2.layoutBox)) {
        target = this.target || createBox();
        const xLength = calcLength(this.layout.layoutBox.x);
        target.x.min = lead.target.x.min;
        target.x.max = target.x.min + xLength;
        const yLength = calcLength(this.layout.layoutBox.y);
        target.y.min = lead.target.y.min;
        target.y.max = target.y.min + yLength;
      }
      copyBoxInto(targetWithTransforms, target);
      transformBox(targetWithTransforms, latestValues);
      calcBoxDelta(this.projectionDeltaWithTransform, this.layoutCorrected, targetWithTransforms, latestValues);
    }
    registerSharedNode(layoutId, node) {
      if (!this.sharedNodes.has(layoutId)) {
        this.sharedNodes.set(layoutId, new NodeStack());
      }
      const stack = this.sharedNodes.get(layoutId);
      stack.add(node);
      const config = node.options.initialPromotionConfig;
      node.promote({
        transition: config ? config.transition : void 0,
        preserveFollowOpacity: config && config.shouldPreserveFollowOpacity ? config.shouldPreserveFollowOpacity(node) : void 0
      });
    }
    isLead() {
      const stack = this.getStack();
      return stack ? stack.lead === this : true;
    }
    getLead() {
      const { layoutId } = this.options;
      return layoutId ? this.getStack()?.lead || this : this;
    }
    getPrevLead() {
      const { layoutId } = this.options;
      return layoutId ? this.getStack()?.prevLead : void 0;
    }
    getStack() {
      const { layoutId } = this.options;
      if (layoutId)
        return this.root.sharedNodes.get(layoutId);
    }
    promote({ needsReset, transition, preserveFollowOpacity } = {}) {
      const stack = this.getStack();
      if (stack)
        stack.promote(this, preserveFollowOpacity);
      if (needsReset) {
        this.projectionDelta = void 0;
        this.needsReset = true;
      }
      if (transition)
        this.setOptions({ transition });
    }
    relegate() {
      const stack = this.getStack();
      if (stack) {
        return stack.relegate(this);
      } else {
        return false;
      }
    }
    resetSkewAndRotation() {
      const { visualElement } = this.options;
      if (!visualElement)
        return;
      let hasDistortingTransform = false;
      const { latestValues } = visualElement;
      if (latestValues.z || latestValues.rotate || latestValues.rotateX || latestValues.rotateY || latestValues.rotateZ || latestValues.skewX || latestValues.skewY) {
        hasDistortingTransform = true;
      }
      if (!hasDistortingTransform)
        return;
      const resetValues = {};
      if (latestValues.z) {
        resetDistortingTransform("z", visualElement, resetValues, this.animationValues);
      }
      for (let i = 0; i < transformAxes.length; i++) {
        resetDistortingTransform(`rotate${transformAxes[i]}`, visualElement, resetValues, this.animationValues);
        resetDistortingTransform(`skew${transformAxes[i]}`, visualElement, resetValues, this.animationValues);
      }
      visualElement.render();
      for (const key in resetValues) {
        visualElement.setStaticValue(key, resetValues[key]);
        if (this.animationValues) {
          this.animationValues[key] = resetValues[key];
        }
      }
      visualElement.scheduleRender();
    }
    applyProjectionStyles(targetStyle, styleProp) {
      if (!this.instance || this.isSVG)
        return;
      if (!this.isVisible) {
        targetStyle.visibility = "hidden";
        return;
      }
      const transformTemplate = this.getTransformTemplate();
      if (this.needsReset) {
        this.needsReset = false;
        targetStyle.visibility = "";
        targetStyle.opacity = "";
        targetStyle.pointerEvents = resolveMotionValue(styleProp?.pointerEvents) || "";
        targetStyle.transform = transformTemplate ? transformTemplate(this.latestValues, "") : "none";
        return;
      }
      const lead = this.getLead();
      if (!this.projectionDelta || !this.layout || !lead.target) {
        if (this.options.layoutId) {
          targetStyle.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1;
          targetStyle.pointerEvents = resolveMotionValue(styleProp?.pointerEvents) || "";
        }
        if (this.hasProjected && !hasTransform(this.latestValues)) {
          targetStyle.transform = transformTemplate ? transformTemplate({}, "") : "none";
          this.hasProjected = false;
        }
        return;
      }
      targetStyle.visibility = "";
      const valuesToRender = lead.animationValues || lead.latestValues;
      this.applyTransformsToTarget();
      let transform = buildProjectionTransform(this.projectionDeltaWithTransform, this.treeScale, valuesToRender);
      if (transformTemplate) {
        transform = transformTemplate(valuesToRender, transform);
      }
      targetStyle.transform = transform;
      const { x, y } = this.projectionDelta;
      targetStyle.transformOrigin = `${x.origin * 100}% ${y.origin * 100}% 0`;
      if (lead.animationValues) {
        targetStyle.opacity = lead === this ? valuesToRender.opacity ?? this.latestValues.opacity ?? 1 : this.preserveOpacity ? this.latestValues.opacity : valuesToRender.opacityExit;
      } else {
        targetStyle.opacity = lead === this ? valuesToRender.opacity !== void 0 ? valuesToRender.opacity : "" : valuesToRender.opacityExit !== void 0 ? valuesToRender.opacityExit : 0;
      }
      for (const key in scaleCorrectors) {
        if (valuesToRender[key] === void 0)
          continue;
        const { correct, applyTo, isCSSVariable } = scaleCorrectors[key];
        const corrected = transform === "none" ? valuesToRender[key] : correct(valuesToRender[key], lead);
        if (applyTo) {
          const num = applyTo.length;
          for (let i = 0; i < num; i++) {
            targetStyle[applyTo[i]] = corrected;
          }
        } else {
          if (isCSSVariable) {
            this.options.visualElement.renderState.vars[key] = corrected;
          } else {
            targetStyle[key] = corrected;
          }
        }
      }
      if (this.options.layoutId) {
        targetStyle.pointerEvents = lead === this ? resolveMotionValue(styleProp?.pointerEvents) || "" : "none";
      }
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((node) => node.currentAnimation?.stop());
      this.root.nodes.forEach(clearMeasurements);
      this.root.sharedNodes.clear();
    }
  };
}
function updateLayout(node) {
  node.updateLayout();
}
function notifyLayoutUpdate(node) {
  const snapshot = node.resumeFrom?.snapshot || node.snapshot;
  if (node.isLead() && node.layout && snapshot && node.hasListeners("didUpdate")) {
    const { layoutBox: layout2, measuredBox: measuredLayout } = node.layout;
    const { animationType } = node.options;
    const isShared = snapshot.source !== node.layout.source;
    if (animationType === "size") {
      eachAxis((axis) => {
        const axisSnapshot = isShared ? snapshot.measuredBox[axis] : snapshot.layoutBox[axis];
        const length = calcLength(axisSnapshot);
        axisSnapshot.min = layout2[axis].min;
        axisSnapshot.max = axisSnapshot.min + length;
      });
    } else if (animationType === "x" || animationType === "y") {
      const snapAxis = animationType === "x" ? "y" : "x";
      copyAxisInto(isShared ? snapshot.measuredBox[snapAxis] : snapshot.layoutBox[snapAxis], layout2[snapAxis]);
    } else if (shouldAnimatePositionOnly(animationType, snapshot.layoutBox, layout2)) {
      eachAxis((axis) => {
        const axisSnapshot = isShared ? snapshot.measuredBox[axis] : snapshot.layoutBox[axis];
        const length = calcLength(layout2[axis]);
        axisSnapshot.max = axisSnapshot.min + length;
        if (node.relativeTarget && !node.currentAnimation) {
          node.isProjectionDirty = true;
          node.relativeTarget[axis].max = node.relativeTarget[axis].min + length;
        }
      });
    }
    const layoutDelta = createDelta();
    calcBoxDelta(layoutDelta, layout2, snapshot.layoutBox);
    const visualDelta = createDelta();
    if (isShared) {
      calcBoxDelta(visualDelta, node.applyTransform(measuredLayout, true), snapshot.measuredBox);
    } else {
      calcBoxDelta(visualDelta, layout2, snapshot.layoutBox);
    }
    const hasLayoutChanged = !isDeltaZero(layoutDelta);
    let hasRelativeLayoutChanged = false;
    if (!node.resumeFrom) {
      const relativeParent = node.getClosestProjectingParent();
      if (relativeParent && !relativeParent.resumeFrom) {
        const { snapshot: parentSnapshot, layout: parentLayout } = relativeParent;
        if (parentSnapshot && parentLayout) {
          const anchor = node.options.layoutAnchor || void 0;
          const relativeSnapshot = createBox();
          calcRelativePosition(relativeSnapshot, snapshot.layoutBox, parentSnapshot.layoutBox, anchor);
          const relativeLayout = createBox();
          calcRelativePosition(relativeLayout, layout2, parentLayout.layoutBox, anchor);
          if (!boxEqualsRounded(relativeSnapshot, relativeLayout)) {
            hasRelativeLayoutChanged = true;
          }
          if (relativeParent.options.layoutRoot) {
            node.relativeTarget = relativeLayout;
            node.relativeTargetOrigin = relativeSnapshot;
            node.relativeParent = relativeParent;
          }
        }
      }
    }
    node.notifyListeners("didUpdate", {
      layout: layout2,
      snapshot,
      delta: visualDelta,
      layoutDelta,
      hasLayoutChanged,
      hasRelativeLayoutChanged
    });
  } else if (node.isLead()) {
    const { onExitComplete } = node.options;
    onExitComplete && onExitComplete();
  }
  node.options.transition = void 0;
}
function propagateDirtyNodes(node) {
  if (statsBuffer.value) {
    metrics.nodes++;
  }
  if (!node.parent)
    return;
  if (!node.isProjecting()) {
    node.isProjectionDirty = node.parent.isProjectionDirty;
  }
  node.isSharedProjectionDirty || (node.isSharedProjectionDirty = Boolean(node.isProjectionDirty || node.parent.isProjectionDirty || node.parent.isSharedProjectionDirty));
  node.isTransformDirty || (node.isTransformDirty = node.parent.isTransformDirty);
}
function cleanDirtyNodes(node) {
  node.isProjectionDirty = node.isSharedProjectionDirty = node.isTransformDirty = false;
}
function clearSnapshot(node) {
  node.clearSnapshot();
}
function clearMeasurements(node) {
  node.clearMeasurements();
}
function forceLayoutMeasure(node) {
  node.isLayoutDirty = true;
  node.updateLayout();
}
function clearIsLayoutDirty(node) {
  node.isLayoutDirty = false;
}
function ensureDraggedNodesSnapshotted(node) {
  if (node.isAnimationBlocked && node.layout && !node.isLayoutDirty) {
    node.snapshot = node.layout;
    node.isLayoutDirty = true;
  }
}
function resetTransformStyle(node) {
  const { visualElement } = node.options;
  if (visualElement && visualElement.getProps().onBeforeLayoutMeasure) {
    visualElement.notify("BeforeLayoutMeasure");
  }
  node.resetTransform();
}
function finishAnimation(node) {
  node.finishAnimation();
  node.targetDelta = node.relativeTarget = node.target = void 0;
  node.isProjectionDirty = true;
}
function resolveTargetDelta(node) {
  node.resolveTargetDelta();
}
function calcProjection(node) {
  node.calcProjection();
}
function resetSkewAndRotation(node) {
  node.resetSkewAndRotation();
}
function removeLeadSnapshots(stack) {
  stack.removeLeadSnapshot();
}
function mixAxisDeltaLinear(output, delta, p) {
  output.translate = mixNumber(delta.translate, 0, p);
  output.scale = mixNumber(delta.scale, 1, p);
  output.origin = delta.origin;
  output.originPoint = delta.originPoint;
}
function mixAxis(output, from, to, p) {
  output.min = mixNumber(from.min, to.min, p);
  output.max = mixNumber(from.max, to.max, p);
}
function mixBox(output, from, to, p) {
  mixAxis(output.x, from.x, to.x, p);
  mixAxis(output.y, from.y, to.y, p);
}
function hasOpacityCrossfade(node) {
  return node.animationValues && node.animationValues.opacityExit !== void 0;
}
var defaultLayoutTransition = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
};
var userAgentContains = (string) => typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(string);
var roundPoint = userAgentContains("applewebkit/") && !userAgentContains("chrome/") ? Math.round : noop;
function roundAxis(axis) {
  axis.min = roundPoint(axis.min);
  axis.max = roundPoint(axis.max);
}
function roundBox(box) {
  roundAxis(box.x);
  roundAxis(box.y);
}
function shouldAnimatePositionOnly(animationType, snapshot, layout2) {
  return animationType === "position" || animationType === "preserve-aspect" && !isNear(aspectRatio(snapshot), aspectRatio(layout2), 0.2);
}
function checkNodeWasScrollRoot(node) {
  return node !== node.root && node.scroll?.wasRoot;
}

// node_modules/motion-dom/dist/es/projection/node/DocumentProjectionNode.mjs
var DocumentProjectionNode = createProjectionNode({
  attachResizeListener: (ref, notify) => addDomEvent(ref, "resize", notify),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body?.scrollLeft || 0,
    y: document.documentElement.scrollTop || document.body?.scrollTop || 0
  }),
  checkIsScrollRoot: () => true
});

// node_modules/motion-dom/dist/es/projection/node/HTMLProjectionNode.mjs
var rootProjectionNode = {
  current: void 0
};
var HTMLProjectionNode = createProjectionNode({
  measureScroll: (instance) => ({
    x: instance.scrollLeft,
    y: instance.scrollTop
  }),
  defaultParent: () => {
    if (!rootProjectionNode.current) {
      const documentNode = new DocumentProjectionNode({});
      documentNode.mount(window);
      documentNode.setOptions({ layoutScroll: true });
      rootProjectionNode.current = documentNode;
    }
    return rootProjectionNode.current;
  },
  resetTransform: (instance, value) => {
    instance.style.transform = value !== void 0 ? value : "none";
  },
  checkIsScrollRoot: (instance) => Boolean(window.getComputedStyle(instance).position === "fixed")
});

// node_modules/framer-motion/dist/es/components/AnimatePresence/PopChild.mjs
import * as React2 from "react";
import { useId, useRef as useRef2, useContext, useInsertionEffect } from "react";

// node_modules/framer-motion/dist/es/context/MotionConfigContext.mjs
import { createContext as createContext3 } from "react";
var MotionConfigContext = createContext3({
  transformPagePoint: (p) => p,
  isStatic: false,
  reducedMotion: "never"
});

// node_modules/framer-motion/dist/es/utils/use-composed-ref.mjs
import * as React from "react";
function setRef(ref, value) {
  if (typeof ref === "function") {
    return ref(value);
  } else if (ref !== null && ref !== void 0) {
    ref.current = value;
  }
}
function composeRefs(...refs) {
  return (node) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node);
      if (!hasCleanup && typeof cleanup === "function") {
        hasCleanup = true;
      }
      return cleanup;
    });
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup === "function") {
            cleanup();
          } else {
            setRef(refs[i], null);
          }
        }
      };
    }
  };
}
function useComposedRefs(...refs) {
  return React.useCallback(composeRefs(...refs), refs);
}

// node_modules/framer-motion/dist/es/components/AnimatePresence/PopChild.mjs
var PopChildMeasure = class extends React2.Component {
  getSnapshotBeforeUpdate(prevProps) {
    const element = this.props.childRef.current;
    if (isHTMLElement(element) && prevProps.isPresent && !this.props.isPresent && this.props.pop !== false) {
      const parent = element.offsetParent;
      const parentWidth = isHTMLElement(parent) ? parent.offsetWidth || 0 : 0;
      const parentHeight = isHTMLElement(parent) ? parent.offsetHeight || 0 : 0;
      const computedStyle = getComputedStyle(element);
      const size = this.props.sizeRef.current;
      size.height = parseFloat(computedStyle.height);
      size.width = parseFloat(computedStyle.width);
      size.top = element.offsetTop;
      size.left = element.offsetLeft;
      size.right = parentWidth - size.width - size.left;
      size.bottom = parentHeight - size.height - size.top;
      size.direction = computedStyle.direction;
    }
    return null;
  }
  /**
   * Required with getSnapshotBeforeUpdate to stop React complaining.
   */
  componentDidUpdate() {
  }
  render() {
    return this.props.children;
  }
};
function PopChild({ children, isPresent, anchorX, anchorY, root, pop }) {
  const id3 = useId();
  const ref = useRef2(null);
  const size = useRef2({
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    direction: "ltr"
  });
  const { nonce } = useContext(MotionConfigContext);
  const childRef = pop !== false ? children.props?.ref ?? children?.ref : void 0;
  const composedRef = useComposedRefs(ref, childRef);
  useInsertionEffect(() => {
    const { width, height, top, left, right, bottom, direction } = size.current;
    if (isPresent || pop === false || !ref.current || !width || !height)
      return;
    const isRTL = direction === "rtl";
    const x = anchorX === "left" ? isRTL ? `right: ${right}` : `left: ${left}` : isRTL ? `left: ${left}` : `right: ${right}`;
    const y = anchorY === "bottom" ? `bottom: ${bottom}` : `top: ${top}`;
    ref.current.dataset.motionPopId = id3;
    const style = document.createElement("style");
    if (nonce)
      style.nonce = nonce;
    const parent = root ?? document.head;
    parent.appendChild(style);
    if (style.sheet) {
      style.sheet.insertRule(`
          [data-motion-pop-id="${id3}"] {
            position: absolute !important;
            width: ${width}px !important;
            height: ${height}px !important;
            ${x}px !important;
            ${y}px !important;
          }
        `);
    }
    return () => {
      ref.current?.removeAttribute("data-motion-pop-id");
      if (parent.contains(style)) {
        parent.removeChild(style);
      }
    };
  }, [isPresent]);
  return jsx(PopChildMeasure, { isPresent, childRef: ref, sizeRef: size, pop, children: pop === false ? children : React2.cloneElement(children, { ref: composedRef }) });
}

// node_modules/framer-motion/dist/es/components/AnimatePresence/PresenceChild.mjs
var PresenceChild = ({ children, initial, isPresent, onExitComplete, custom, presenceAffectsLayout, mode, anchorX, anchorY, root }) => {
  const presenceChildren = useConstant(newChildrenMap);
  const id3 = useId2();
  const isPresentRef = useRef3(isPresent);
  const onExitCompleteRef = useRef3(onExitComplete);
  useIsomorphicLayoutEffect(() => {
    isPresentRef.current = isPresent;
    onExitCompleteRef.current = onExitComplete;
  });
  let isReusedContext = true;
  let context = useMemo(() => {
    isReusedContext = false;
    return {
      id: id3,
      initial,
      isPresent,
      custom,
      onExitComplete: (childId) => {
        presenceChildren.set(childId, true);
        for (const isComplete of presenceChildren.values()) {
          if (!isComplete)
            return;
        }
        onExitComplete && onExitComplete();
      },
      register: (childId) => {
        presenceChildren.set(childId, false);
        return () => {
          presenceChildren.delete(childId);
          !isPresentRef.current && !presenceChildren.size && onExitCompleteRef.current?.();
        };
      }
    };
  }, [isPresent, presenceChildren, onExitComplete]);
  if (presenceAffectsLayout && isReusedContext) {
    context = { ...context };
  }
  useMemo(() => {
    presenceChildren.forEach((_, key) => presenceChildren.set(key, false));
  }, [isPresent]);
  React3.useEffect(() => {
    !isPresent && !presenceChildren.size && onExitComplete && onExitComplete();
  }, [isPresent]);
  children = jsx2(PopChild, { pop: mode === "popLayout", isPresent, anchorX, anchorY, root, children });
  return jsx2(PresenceContext.Provider, { value: context, children });
};
function newChildrenMap() {
  return /* @__PURE__ */ new Map();
}

// node_modules/framer-motion/dist/es/components/AnimatePresence/use-presence.mjs
import { useContext as useContext2, useId as useId3, useEffect as useEffect3, useCallback as useCallback2 } from "react";
function usePresence(subscribe = true) {
  const context = useContext2(PresenceContext);
  if (context === null)
    return [true, null];
  const { isPresent, onExitComplete, register } = context;
  const id3 = useId3();
  useEffect3(() => {
    if (subscribe) {
      return register(id3);
    }
  }, [subscribe]);
  const safeToRemove = useCallback2(() => subscribe && onExitComplete && onExitComplete(id3), [id3, onExitComplete, subscribe]);
  return !isPresent && onExitComplete ? [false, safeToRemove] : [true];
}

// node_modules/framer-motion/dist/es/components/AnimatePresence/utils.mjs
import { Children, isValidElement } from "react";
var getChildKey = (child) => child.key || "";
function onlyElements(children) {
  const filtered = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child))
      filtered.push(child);
  });
  return filtered;
}

// node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs
var AnimatePresence = ({ children, custom, initial = true, onExitComplete, presenceAffectsLayout = true, mode = "sync", propagate = false, anchorX = "left", anchorY = "top", root }) => {
  const [isParentPresent, safeToRemove] = usePresence(propagate);
  const presentChildren = useMemo2(() => onlyElements(children), [children]);
  const presentKeys = propagate && !isParentPresent ? [] : presentChildren.map(getChildKey);
  const isInitialRender = useRef4(true);
  const pendingPresentChildren = useRef4(presentChildren);
  const exitComplete = useConstant(() => /* @__PURE__ */ new Map());
  const exitingComponents = useRef4(/* @__PURE__ */ new Set());
  const [diffedChildren, setDiffedChildren] = useState(presentChildren);
  const [renderedChildren, setRenderedChildren] = useState(presentChildren);
  useIsomorphicLayoutEffect(() => {
    isInitialRender.current = false;
    pendingPresentChildren.current = presentChildren;
    for (let i = 0; i < renderedChildren.length; i++) {
      const key = getChildKey(renderedChildren[i]);
      if (!presentKeys.includes(key)) {
        if (exitComplete.get(key) !== true) {
          exitComplete.set(key, false);
        }
      } else {
        exitComplete.delete(key);
        exitingComponents.current.delete(key);
      }
    }
  }, [renderedChildren, presentKeys.length, presentKeys.join("-")]);
  const exitingChildren = [];
  if (presentChildren !== diffedChildren) {
    let nextChildren = [...presentChildren];
    for (let i = 0; i < renderedChildren.length; i++) {
      const child = renderedChildren[i];
      const key = getChildKey(child);
      if (!presentKeys.includes(key)) {
        nextChildren.splice(i, 0, child);
        exitingChildren.push(child);
      }
    }
    if (mode === "wait" && exitingChildren.length) {
      nextChildren = exitingChildren;
    }
    setRenderedChildren(onlyElements(nextChildren));
    setDiffedChildren(presentChildren);
    return null;
  }
  if (process.env.NODE_ENV !== "production" && mode === "wait" && renderedChildren.length > 1) {
    console.warn(`You're attempting to animate multiple children within AnimatePresence, but its mode is set to "wait". This will lead to odd visual behaviour.`);
  }
  const { forceRender } = useContext3(LayoutGroupContext);
  return jsx3(Fragment, { children: renderedChildren.map((child) => {
    const key = getChildKey(child);
    const isPresent = propagate && !isParentPresent ? false : presentChildren === renderedChildren || presentKeys.includes(key);
    const onExit = () => {
      if (exitingComponents.current.has(key)) {
        return;
      }
      if (exitComplete.has(key)) {
        exitingComponents.current.add(key);
        exitComplete.set(key, true);
      } else {
        return;
      }
      let isEveryExitComplete = true;
      exitComplete.forEach((isExitComplete) => {
        if (!isExitComplete)
          isEveryExitComplete = false;
      });
      if (isEveryExitComplete) {
        forceRender?.();
        setRenderedChildren(pendingPresentChildren.current);
        propagate && safeToRemove?.();
        onExitComplete && onExitComplete();
      }
    };
    return jsx3(PresenceChild, { isPresent, initial: !isInitialRender.current || initial ? void 0 : false, custom, presenceAffectsLayout, mode, root, onExitComplete: isPresent ? void 0 : onExit, anchorX, anchorY, children: child }, key);
  }) });
};

// node_modules/framer-motion/dist/es/context/LazyContext.mjs
import { createContext as createContext4 } from "react";
var LazyContext = createContext4({ strict: false });

// node_modules/framer-motion/dist/es/motion/features/definitions.mjs
var featureProps = {
  animation: [
    "animate",
    "variants",
    "whileHover",
    "whileTap",
    "exit",
    "whileInView",
    "whileFocus",
    "whileDrag"
  ],
  exit: ["exit"],
  drag: ["drag", "dragControls"],
  focus: ["whileFocus"],
  hover: ["whileHover", "onHoverStart", "onHoverEnd"],
  tap: ["whileTap", "onTap", "onTapStart", "onTapCancel"],
  pan: ["onPan", "onPanStart", "onPanSessionStart", "onPanEnd"],
  inView: ["whileInView", "onViewportEnter", "onViewportLeave"],
  layout: ["layout", "layoutId"]
};
var isInitialized = false;
function initFeatureDefinitions() {
  if (isInitialized)
    return;
  const initialFeatureDefinitions = {};
  for (const key in featureProps) {
    initialFeatureDefinitions[key] = {
      isEnabled: (props) => featureProps[key].some((name) => !!props[name])
    };
  }
  setFeatureDefinitions(initialFeatureDefinitions);
  isInitialized = true;
}
function getInitializedFeatureDefinitions() {
  initFeatureDefinitions();
  return getFeatureDefinitions();
}

// node_modules/framer-motion/dist/es/motion/features/load-features.mjs
function loadFeatures(features) {
  const featureDefinitions2 = getInitializedFeatureDefinitions();
  for (const key in features) {
    featureDefinitions2[key] = {
      ...featureDefinitions2[key],
      ...features[key]
    };
  }
  setFeatureDefinitions(featureDefinitions2);
}

// node_modules/framer-motion/dist/es/motion/utils/valid-prop.mjs
var validMotionProps = /* @__PURE__ */ new Set([
  "animate",
  "exit",
  "variants",
  "initial",
  "style",
  "values",
  "variants",
  "transition",
  "transformTemplate",
  "custom",
  "inherit",
  "onBeforeLayoutMeasure",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDragStart",
  "onDrag",
  "onDragEnd",
  "onMeasureDragConstraints",
  "onDirectionLock",
  "onDragTransitionEnd",
  "_dragX",
  "_dragY",
  "onHoverStart",
  "onHoverEnd",
  "onViewportEnter",
  "onViewportLeave",
  "globalTapTarget",
  "propagate",
  "ignoreStrict",
  "viewport"
]);
function isValidMotionProp(key) {
  return key.startsWith("while") || key.startsWith("drag") && key !== "draggable" || key.startsWith("layout") || key.startsWith("onTap") || key.startsWith("onPan") || key.startsWith("onLayout") || validMotionProps.has(key);
}

// node_modules/framer-motion/dist/es/render/dom/utils/filter-props.mjs
var shouldForward = (key) => !isValidMotionProp(key);
function loadExternalIsValidProp(isValidProp) {
  if (typeof isValidProp !== "function")
    return;
  shouldForward = (key) => key.startsWith("on") ? !isValidMotionProp(key) : isValidProp(key);
}
try {
  const emotionPkg = "@emotion/is-prop-valid";
  loadExternalIsValidProp(__require(emotionPkg).default);
} catch {
}
function filterProps(props, isDom, forwardMotionProps) {
  const filteredProps = {};
  for (const key in props) {
    if (key === "values" && typeof props.values === "object")
      continue;
    if (isMotionValue(props[key]))
      continue;
    if (shouldForward(key) || forwardMotionProps === true && isValidMotionProp(key) || !isDom && !isValidMotionProp(key) || // If trying to use native HTML drag events, forward drag listeners
    props["draggable"] && key.startsWith("onDrag")) {
      filteredProps[key] = props[key];
    }
  }
  return filteredProps;
}

// node_modules/framer-motion/dist/es/motion/index.mjs
import { jsxs, jsx as jsx4 } from "react/jsx-runtime";
import { forwardRef, useContext as useContext7 } from "react";

// node_modules/framer-motion/dist/es/context/MotionContext/index.mjs
import { createContext as createContext5 } from "react";
var MotionContext = /* @__PURE__ */ createContext5({});

// node_modules/framer-motion/dist/es/context/MotionContext/create.mjs
import { useContext as useContext4, useMemo as useMemo3 } from "react";

// node_modules/framer-motion/dist/es/context/MotionContext/utils.mjs
function getCurrentTreeVariants(props, context) {
  if (isControllingVariants(props)) {
    const { initial, animate } = props;
    return {
      initial: initial === false || isVariantLabel(initial) ? initial : void 0,
      animate: isVariantLabel(animate) ? animate : void 0
    };
  }
  return props.inherit !== false ? context : {};
}

// node_modules/framer-motion/dist/es/context/MotionContext/create.mjs
function useCreateMotionContext(props) {
  const { initial, animate } = getCurrentTreeVariants(props, useContext4(MotionContext));
  return useMemo3(() => ({ initial, animate }), [variantLabelsAsDependency(initial), variantLabelsAsDependency(animate)]);
}
function variantLabelsAsDependency(prop) {
  return Array.isArray(prop) ? prop.join(" ") : prop;
}

// node_modules/framer-motion/dist/es/render/dom/use-render.mjs
import { Fragment as Fragment2, useMemo as useMemo6, createElement } from "react";

// node_modules/framer-motion/dist/es/render/html/use-props.mjs
import { useMemo as useMemo4 } from "react";

// node_modules/framer-motion/dist/es/render/html/utils/create-render-state.mjs
var createHtmlRenderState = () => ({
  style: {},
  transform: {},
  transformOrigin: {},
  vars: {}
});

// node_modules/framer-motion/dist/es/render/html/use-props.mjs
function copyRawValuesOnly(target, source, props) {
  for (const key in source) {
    if (!isMotionValue(source[key]) && !isForcedMotionValue(key, props)) {
      target[key] = source[key];
    }
  }
}
function useInitialMotionValues({ transformTemplate }, visualState) {
  return useMemo4(() => {
    const state = createHtmlRenderState();
    buildHTMLStyles(state, visualState, transformTemplate);
    return Object.assign({}, state.vars, state.style);
  }, [visualState]);
}
function useStyle(props, visualState) {
  const styleProp = props.style || {};
  const style = {};
  copyRawValuesOnly(style, styleProp, props);
  Object.assign(style, useInitialMotionValues(props, visualState));
  return style;
}
function useHTMLProps(props, visualState) {
  const htmlProps = {};
  const style = useStyle(props, visualState);
  if (props.drag && props.dragListener !== false) {
    htmlProps.draggable = false;
    style.userSelect = style.WebkitUserSelect = style.WebkitTouchCallout = "none";
    style.touchAction = props.drag === true ? "none" : `pan-${props.drag === "x" ? "y" : "x"}`;
  }
  if (props.tabIndex === void 0 && (props.onTap || props.onTapStart || props.whileTap)) {
    htmlProps.tabIndex = 0;
  }
  htmlProps.style = style;
  return htmlProps;
}

// node_modules/framer-motion/dist/es/render/svg/use-props.mjs
import { useMemo as useMemo5 } from "react";

// node_modules/framer-motion/dist/es/render/svg/utils/create-render-state.mjs
var createSvgRenderState = () => ({
  ...createHtmlRenderState(),
  attrs: {}
});

// node_modules/framer-motion/dist/es/render/svg/use-props.mjs
function useSVGProps(props, visualState, _isStatic, Component3) {
  const visualProps = useMemo5(() => {
    const state = createSvgRenderState();
    buildSVGAttrs(state, visualState, isSVGTag(Component3), props.transformTemplate, props.style);
    return {
      ...state.attrs,
      style: { ...state.style }
    };
  }, [visualState]);
  if (props.style) {
    const rawStyles = {};
    copyRawValuesOnly(rawStyles, props.style, props);
    visualProps.style = { ...rawStyles, ...visualProps.style };
  }
  return visualProps;
}

// node_modules/framer-motion/dist/es/render/svg/lowercase-elements.mjs
var lowercaseSVGElements = [
  "animate",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "filter",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "switch",
  "symbol",
  "svg",
  "text",
  "tspan",
  "use",
  "view"
];

// node_modules/framer-motion/dist/es/render/dom/utils/is-svg-component.mjs
function isSVGComponent(Component3) {
  if (
    /**
     * If it's not a string, it's a custom React component. Currently we only support
     * HTML custom React components.
     */
    typeof Component3 !== "string" || /**
     * If it contains a dash, the element is a custom HTML webcomponent.
     */
    Component3.includes("-")
  ) {
    return false;
  } else if (
    /**
     * If it's in our list of lowercase SVG tags, it's an SVG component
     */
    lowercaseSVGElements.indexOf(Component3) > -1 || /**
     * If it contains a capital letter, it's an SVG component
     */
    /[A-Z]/u.test(Component3)
  ) {
    return true;
  }
  return false;
}

// node_modules/framer-motion/dist/es/render/dom/use-render.mjs
function useRender(Component3, props, ref, { latestValues }, isStatic, forwardMotionProps = false, isSVG) {
  const useVisualProps = isSVG ?? isSVGComponent(Component3) ? useSVGProps : useHTMLProps;
  const visualProps = useVisualProps(props, latestValues, isStatic, Component3);
  const filteredProps = filterProps(props, typeof Component3 === "string", forwardMotionProps);
  const elementProps = Component3 !== Fragment2 ? { ...filteredProps, ...visualProps, ref } : {};
  const { children } = props;
  const renderedChildren = useMemo6(() => isMotionValue(children) ? children.get() : children, [children]);
  return createElement(Component3, {
    ...elementProps,
    children: renderedChildren
  });
}

// node_modules/framer-motion/dist/es/motion/utils/use-visual-state.mjs
import { useContext as useContext5 } from "react";
function makeState({ scrapeMotionValuesFromProps: scrapeMotionValuesFromProps3, createRenderState }, props, context, presenceContext) {
  const state = {
    latestValues: makeLatestValues(props, context, presenceContext, scrapeMotionValuesFromProps3),
    renderState: createRenderState()
  };
  return state;
}
function makeLatestValues(props, context, presenceContext, scrapeMotionValues) {
  const values = {};
  const motionValues = scrapeMotionValues(props, {});
  for (const key in motionValues) {
    values[key] = resolveMotionValue(motionValues[key]);
  }
  let { initial, animate } = props;
  const isControllingVariants$1 = isControllingVariants(props);
  const isVariantNode$1 = isVariantNode(props);
  if (context && isVariantNode$1 && !isControllingVariants$1 && props.inherit !== false) {
    if (initial === void 0)
      initial = context.initial;
    if (animate === void 0)
      animate = context.animate;
  }
  let isInitialAnimationBlocked = presenceContext ? presenceContext.initial === false : false;
  isInitialAnimationBlocked = isInitialAnimationBlocked || initial === false;
  const variantToSet = isInitialAnimationBlocked ? animate : initial;
  if (variantToSet && typeof variantToSet !== "boolean" && !isAnimationControls(variantToSet)) {
    const list = Array.isArray(variantToSet) ? variantToSet : [variantToSet];
    for (let i = 0; i < list.length; i++) {
      const resolved = resolveVariantFromProps(props, list[i]);
      if (resolved) {
        const { transitionEnd, transition, ...target } = resolved;
        for (const key in target) {
          let valueTarget = target[key];
          if (Array.isArray(valueTarget)) {
            const index = isInitialAnimationBlocked ? valueTarget.length - 1 : 0;
            valueTarget = valueTarget[index];
          }
          if (valueTarget !== null) {
            values[key] = valueTarget;
          }
        }
        for (const key in transitionEnd) {
          values[key] = transitionEnd[key];
        }
      }
    }
  }
  return values;
}
var makeUseVisualState = (config) => (props, isStatic) => {
  const context = useContext5(MotionContext);
  const presenceContext = useContext5(PresenceContext);
  const make = () => makeState(config, props, context, presenceContext);
  return isStatic ? make() : useConstant(make);
};

// node_modules/framer-motion/dist/es/render/html/use-html-visual-state.mjs
var useHTMLVisualState = /* @__PURE__ */ makeUseVisualState({
  scrapeMotionValuesFromProps,
  createRenderState: createHtmlRenderState
});

// node_modules/framer-motion/dist/es/render/svg/use-svg-visual-state.mjs
var useSVGVisualState = /* @__PURE__ */ makeUseVisualState({
  scrapeMotionValuesFromProps: scrapeMotionValuesFromProps2,
  createRenderState: createSvgRenderState
});

// node_modules/framer-motion/dist/es/motion/utils/symbol.mjs
var motionComponentSymbol = /* @__PURE__ */ Symbol.for("motionComponentSymbol");

// node_modules/framer-motion/dist/es/motion/utils/use-motion-ref.mjs
import { useRef as useRef5, useInsertionEffect as useInsertionEffect2, useCallback as useCallback3 } from "react";
function useMotionRef(visualState, visualElement, externalRef) {
  const externalRefContainer = useRef5(externalRef);
  useInsertionEffect2(() => {
    externalRefContainer.current = externalRef;
  });
  const refCleanup = useRef5(null);
  return useCallback3((instance) => {
    if (instance) {
      visualState.onMount?.(instance);
    }
    if (visualElement) {
      instance ? visualElement.mount(instance) : visualElement.unmount();
    }
    const ref = externalRefContainer.current;
    if (typeof ref === "function") {
      if (instance) {
        const cleanup = ref(instance);
        if (typeof cleanup === "function") {
          refCleanup.current = cleanup;
        }
      } else if (refCleanup.current) {
        refCleanup.current();
        refCleanup.current = null;
      } else {
        ref(instance);
      }
    } else if (ref) {
      ref.current = instance;
    }
  }, [visualElement]);
}

// node_modules/framer-motion/dist/es/motion/utils/use-visual-element.mjs
import { useContext as useContext6, useRef as useRef6, useInsertionEffect as useInsertionEffect3, useEffect as useEffect4 } from "react";

// node_modules/framer-motion/dist/es/context/SwitchLayoutGroupContext.mjs
import { createContext as createContext6 } from "react";
var SwitchLayoutGroupContext = createContext6({});

// node_modules/framer-motion/dist/es/utils/is-ref-object.mjs
function isRefObject(ref) {
  return ref && typeof ref === "object" && Object.prototype.hasOwnProperty.call(ref, "current");
}

// node_modules/framer-motion/dist/es/motion/utils/use-visual-element.mjs
function useVisualElement(Component3, visualState, props, createVisualElement, ProjectionNodeConstructor, isSVG) {
  const { visualElement: parent } = useContext6(MotionContext);
  const lazyContext = useContext6(LazyContext);
  const presenceContext = useContext6(PresenceContext);
  const motionConfig = useContext6(MotionConfigContext);
  const reducedMotionConfig = motionConfig.reducedMotion;
  const skipAnimations = motionConfig.skipAnimations;
  const visualElementRef = useRef6(null);
  const hasMountedOnce = useRef6(false);
  createVisualElement = createVisualElement || lazyContext.renderer;
  if (!visualElementRef.current && createVisualElement) {
    visualElementRef.current = createVisualElement(Component3, {
      visualState,
      parent,
      props,
      presenceContext,
      blockInitialAnimation: presenceContext ? presenceContext.initial === false : false,
      reducedMotionConfig,
      skipAnimations,
      isSVG
    });
    if (hasMountedOnce.current && visualElementRef.current) {
      visualElementRef.current.manuallyAnimateOnMount = true;
    }
  }
  const visualElement = visualElementRef.current;
  const initialLayoutGroupConfig = useContext6(SwitchLayoutGroupContext);
  if (visualElement && !visualElement.projection && ProjectionNodeConstructor && (visualElement.type === "html" || visualElement.type === "svg")) {
    createProjectionNode2(visualElementRef.current, props, ProjectionNodeConstructor, initialLayoutGroupConfig);
  }
  const isMounted = useRef6(false);
  useInsertionEffect3(() => {
    if (visualElement && isMounted.current) {
      visualElement.update(props, presenceContext);
    }
  });
  const optimisedAppearId = props[optimizedAppearDataAttribute];
  const wantsHandoff = useRef6(Boolean(optimisedAppearId) && typeof window !== "undefined" && !window.MotionHandoffIsComplete?.(optimisedAppearId) && window.MotionHasOptimisedAnimation?.(optimisedAppearId));
  useIsomorphicLayoutEffect(() => {
    hasMountedOnce.current = true;
    if (!visualElement)
      return;
    isMounted.current = true;
    window.MotionIsMounted = true;
    visualElement.updateFeatures();
    visualElement.scheduleRenderMicrotask();
    if (wantsHandoff.current && visualElement.animationState) {
      visualElement.animationState.animateChanges();
    }
  });
  useEffect4(() => {
    if (!visualElement)
      return;
    if (!wantsHandoff.current && visualElement.animationState) {
      visualElement.animationState.animateChanges();
    }
    if (wantsHandoff.current) {
      queueMicrotask(() => {
        window.MotionHandoffMarkAsComplete?.(optimisedAppearId);
      });
      wantsHandoff.current = false;
    }
    visualElement.enteringChildren = void 0;
  });
  return visualElement;
}
function createProjectionNode2(visualElement, props, ProjectionNodeConstructor, initialPromotionConfig) {
  const { layoutId, layout: layout2, drag: drag2, dragConstraints, layoutScroll, layoutRoot, layoutAnchor, layoutCrossfade } = props;
  visualElement.projection = new ProjectionNodeConstructor(visualElement.latestValues, props["data-framer-portal-id"] ? void 0 : getClosestProjectingNode(visualElement.parent));
  visualElement.projection.setOptions({
    layoutId,
    layout: layout2,
    alwaysMeasureLayout: Boolean(drag2) || dragConstraints && isRefObject(dragConstraints),
    visualElement,
    /**
     * TODO: Update options in an effect. This could be tricky as it'll be too late
     * to update by the time layout animations run.
     * We also need to fix this safeToRemove by linking it up to the one returned by usePresence,
     * ensuring it gets called if there's no potential layout animations.
     *
     */
    animationType: typeof layout2 === "string" ? layout2 : "both",
    initialPromotionConfig,
    crossfade: layoutCrossfade,
    layoutScroll,
    layoutRoot,
    layoutAnchor
  });
}
function getClosestProjectingNode(visualElement) {
  if (!visualElement)
    return void 0;
  return visualElement.options.allowProjection !== false ? visualElement.projection : getClosestProjectingNode(visualElement.parent);
}

// node_modules/framer-motion/dist/es/motion/index.mjs
function createMotionComponent(Component3, { forwardMotionProps = false, type } = {}, preloadedFeatures, createVisualElement) {
  preloadedFeatures && loadFeatures(preloadedFeatures);
  const isSVG = type ? type === "svg" : isSVGComponent(Component3);
  const useVisualState = isSVG ? useSVGVisualState : useHTMLVisualState;
  function MotionDOMComponent(props, externalRef) {
    let MeasureLayout2;
    const configAndProps = {
      ...useContext7(MotionConfigContext),
      ...props,
      layoutId: useLayoutId(props)
    };
    const { isStatic } = configAndProps;
    const context = useCreateMotionContext(props);
    const visualState = useVisualState(props, isStatic);
    if (!isStatic && typeof window !== "undefined") {
      useStrictMode(configAndProps, preloadedFeatures);
      const layoutProjection = getProjectionFunctionality(configAndProps);
      MeasureLayout2 = layoutProjection.MeasureLayout;
      context.visualElement = useVisualElement(Component3, visualState, configAndProps, createVisualElement, layoutProjection.ProjectionNode, isSVG);
    }
    return jsxs(MotionContext.Provider, { value: context, children: [MeasureLayout2 && context.visualElement ? jsx4(MeasureLayout2, { visualElement: context.visualElement, ...configAndProps }) : null, useRender(Component3, props, useMotionRef(visualState, context.visualElement, externalRef), visualState, isStatic, forwardMotionProps, isSVG)] });
  }
  MotionDOMComponent.displayName = `motion.${typeof Component3 === "string" ? Component3 : `create(${Component3.displayName ?? Component3.name ?? ""})`}`;
  const ForwardRefMotionComponent = forwardRef(MotionDOMComponent);
  ForwardRefMotionComponent[motionComponentSymbol] = Component3;
  return ForwardRefMotionComponent;
}
function useLayoutId({ layoutId }) {
  const layoutGroupId = useContext7(LayoutGroupContext).id;
  return layoutGroupId && layoutId !== void 0 ? layoutGroupId + "-" + layoutId : layoutId;
}
function useStrictMode(configAndProps, preloadedFeatures) {
  const isStrict = useContext7(LazyContext).strict;
  if (process.env.NODE_ENV !== "production" && preloadedFeatures && isStrict) {
    const strictMessage = "You have rendered a `motion` component within a `LazyMotion` component. This will break tree shaking. Import and render a `m` component instead.";
    configAndProps.ignoreStrict ? warning(false, strictMessage, "lazy-strict-mode") : invariant(false, strictMessage, "lazy-strict-mode");
  }
}
function getProjectionFunctionality(props) {
  const featureDefinitions2 = getInitializedFeatureDefinitions();
  const { drag: drag2, layout: layout2 } = featureDefinitions2;
  if (!drag2 && !layout2)
    return {};
  const combined = { ...drag2, ...layout2 };
  return {
    MeasureLayout: drag2?.isEnabled(props) || layout2?.isEnabled(props) ? combined.MeasureLayout : void 0,
    ProjectionNode: combined.ProjectionNode
  };
}

// node_modules/framer-motion/dist/es/render/components/create-proxy.mjs
function createMotionProxy(preloadedFeatures, createVisualElement) {
  if (typeof Proxy === "undefined") {
    return createMotionComponent;
  }
  const componentCache = /* @__PURE__ */ new Map();
  const factory = (Component3, options) => {
    return createMotionComponent(Component3, options, preloadedFeatures, createVisualElement);
  };
  const deprecatedFactoryFunction = (Component3, options) => {
    if (process.env.NODE_ENV !== "production") {
      warnOnce(false, "motion() is deprecated. Use motion.create() instead.");
    }
    return factory(Component3, options);
  };
  return new Proxy(deprecatedFactoryFunction, {
    /**
     * Called when `motion` is referenced with a prop: `motion.div`, `motion.input` etc.
     * The prop name is passed through as `key` and we can use that to generate a `motion`
     * DOM component with that name.
     */
    get: (_target, key) => {
      if (key === "create")
        return factory;
      if (!componentCache.has(key)) {
        componentCache.set(key, createMotionComponent(key, void 0, preloadedFeatures, createVisualElement));
      }
      return componentCache.get(key);
    }
  });
}

// node_modules/framer-motion/dist/es/render/dom/create-visual-element.mjs
import { Fragment as Fragment3 } from "react";
var createDomVisualElement = (Component3, options) => {
  const isSVG = options.isSVG ?? isSVGComponent(Component3);
  return isSVG ? new SVGVisualElement(options) : new HTMLVisualElement(options, {
    allowProjection: Component3 !== Fragment3
  });
};

// node_modules/framer-motion/dist/es/motion/features/animation/index.mjs
var AnimationFeature = class extends Feature {
  /**
   * We dynamically generate the AnimationState manager as it contains a reference
   * to the underlying animation library. We only want to load that if we load this,
   * so people can optionally code split it out using the `m` component.
   */
  constructor(node) {
    super(node);
    node.animationState || (node.animationState = createAnimationState(node));
  }
  updateAnimationControlsSubscription() {
    const { animate } = this.node.getProps();
    if (isAnimationControls(animate)) {
      this.unmountControls = animate.subscribe(this.node);
    }
  }
  /**
   * Subscribe any provided AnimationControls to the component's VisualElement
   */
  mount() {
    this.updateAnimationControlsSubscription();
  }
  update() {
    const { animate } = this.node.getProps();
    const { animate: prevAnimate } = this.node.prevProps || {};
    if (animate !== prevAnimate) {
      this.updateAnimationControlsSubscription();
    }
  }
  unmount() {
    this.node.animationState.reset();
    this.unmountControls?.();
  }
};

// node_modules/framer-motion/dist/es/motion/features/animation/exit.mjs
var id2 = 0;
var ExitAnimationFeature = class extends Feature {
  constructor() {
    super(...arguments);
    this.id = id2++;
    this.isExitComplete = false;
  }
  update() {
    if (!this.node.presenceContext)
      return;
    const { isPresent, onExitComplete } = this.node.presenceContext;
    const { isPresent: prevIsPresent } = this.node.prevPresenceContext || {};
    if (!this.node.animationState || isPresent === prevIsPresent) {
      return;
    }
    if (isPresent && prevIsPresent === false) {
      if (this.isExitComplete) {
        const { initial, custom } = this.node.getProps();
        if (typeof initial === "string" || typeof initial === "object" && initial !== null && !Array.isArray(initial)) {
          const resolved = resolveVariant(this.node, initial, custom);
          if (resolved) {
            const { transition, transitionEnd, ...target } = resolved;
            for (const key in target) {
              this.node.getValue(key)?.jump(target[key]);
            }
          }
        }
        this.node.animationState.reset();
        this.node.animationState.animateChanges();
      } else {
        this.node.animationState.setActive("exit", false);
      }
      this.isExitComplete = false;
      return;
    }
    const exitAnimation = this.node.animationState.setActive("exit", !isPresent);
    if (onExitComplete && !isPresent) {
      exitAnimation.then(() => {
        this.isExitComplete = true;
        onExitComplete(this.id);
      });
    }
  }
  mount() {
    const { register, onExitComplete } = this.node.presenceContext || {};
    if (onExitComplete) {
      onExitComplete(this.id);
    }
    if (register) {
      this.unmount = register(this.id);
    }
  }
  unmount() {
  }
};

// node_modules/framer-motion/dist/es/motion/features/animations.mjs
var animations = {
  animation: {
    Feature: AnimationFeature
  },
  exit: {
    Feature: ExitAnimationFeature
  }
};

// node_modules/framer-motion/dist/es/events/event-info.mjs
function extractEventInfo(event) {
  return {
    point: {
      x: event.pageX,
      y: event.pageY
    }
  };
}
var addPointerInfo = (handler) => (event) => isPrimaryPointer(event) && handler(event, extractEventInfo(event));

// node_modules/framer-motion/dist/es/events/add-pointer-event.mjs
function addPointerEvent(target, eventName, handler, options) {
  return addDomEvent(target, eventName, addPointerInfo(handler), options);
}

// node_modules/framer-motion/dist/es/utils/get-context-window.mjs
var getContextWindow = ({ current }) => {
  return current ? current.ownerDocument.defaultView : null;
};

// node_modules/framer-motion/dist/es/utils/distance.mjs
var distance = (a, b) => Math.abs(a - b);
function distance2D(a, b) {
  const xDelta = distance(a.x, b.x);
  const yDelta = distance(a.y, b.y);
  return Math.sqrt(xDelta ** 2 + yDelta ** 2);
}

// node_modules/framer-motion/dist/es/gestures/pan/PanSession.mjs
var overflowStyles = /* @__PURE__ */ new Set(["auto", "scroll"]);
var PanSession = class {
  constructor(event, handlers, { transformPagePoint, contextWindow = window, dragSnapToOrigin = false, distanceThreshold = 3, element } = {}) {
    this.startEvent = null;
    this.lastMoveEvent = null;
    this.lastMoveEventInfo = null;
    this.lastRawMoveEventInfo = null;
    this.handlers = {};
    this.contextWindow = window;
    this.scrollPositions = /* @__PURE__ */ new Map();
    this.removeScrollListeners = null;
    this.onElementScroll = (event2) => {
      this.handleScroll(event2.target);
    };
    this.onWindowScroll = () => {
      this.handleScroll(window);
    };
    this.updatePoint = () => {
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      if (this.lastRawMoveEventInfo) {
        this.lastMoveEventInfo = transformPoint(this.lastRawMoveEventInfo, this.transformPagePoint);
      }
      const info2 = getPanInfo(this.lastMoveEventInfo, this.history);
      const isPanStarted = this.startEvent !== null;
      const isDistancePastThreshold = distance2D(info2.offset, { x: 0, y: 0 }) >= this.distanceThreshold;
      if (!isPanStarted && !isDistancePastThreshold)
        return;
      const { point: point2 } = info2;
      const { timestamp: timestamp2 } = frameData;
      this.history.push({ ...point2, timestamp: timestamp2 });
      const { onStart, onMove } = this.handlers;
      if (!isPanStarted) {
        onStart && onStart(this.lastMoveEvent, info2);
        this.startEvent = this.lastMoveEvent;
      }
      onMove && onMove(this.lastMoveEvent, info2);
    };
    this.handlePointerMove = (event2, info2) => {
      this.lastMoveEvent = event2;
      this.lastRawMoveEventInfo = info2;
      this.lastMoveEventInfo = transformPoint(info2, this.transformPagePoint);
      frame.update(this.updatePoint, true);
    };
    this.handlePointerUp = (event2, info2) => {
      this.end();
      const { onEnd, onSessionEnd, resumeAnimation } = this.handlers;
      if (this.dragSnapToOrigin || !this.startEvent) {
        resumeAnimation && resumeAnimation();
      }
      if (!(this.lastMoveEvent && this.lastMoveEventInfo))
        return;
      const panInfo = getPanInfo(event2.type === "pointercancel" ? this.lastMoveEventInfo : transformPoint(info2, this.transformPagePoint), this.history);
      if (this.startEvent && onEnd) {
        onEnd(event2, panInfo);
      }
      onSessionEnd && onSessionEnd(event2, panInfo);
    };
    if (!isPrimaryPointer(event))
      return;
    this.dragSnapToOrigin = dragSnapToOrigin;
    this.handlers = handlers;
    this.transformPagePoint = transformPagePoint;
    this.distanceThreshold = distanceThreshold;
    this.contextWindow = contextWindow || window;
    const info = extractEventInfo(event);
    const initialInfo = transformPoint(info, this.transformPagePoint);
    const { point } = initialInfo;
    const { timestamp } = frameData;
    this.history = [{ ...point, timestamp }];
    const { onSessionStart } = handlers;
    onSessionStart && onSessionStart(event, getPanInfo(initialInfo, this.history));
    const eventOptions = { passive: true, capture: true };
    this.removeListeners = pipe(addPointerEvent(this.contextWindow, "pointermove", this.handlePointerMove, eventOptions), addPointerEvent(this.contextWindow, "pointerup", this.handlePointerUp, eventOptions), addPointerEvent(this.contextWindow, "pointercancel", this.handlePointerUp, eventOptions));
    if (element) {
      this.startScrollTracking(element);
    }
  }
  /**
   * Start tracking scroll on ancestors and window.
   */
  startScrollTracking(element) {
    let current = element.parentElement;
    while (current) {
      const style = getComputedStyle(current);
      if (overflowStyles.has(style.overflowX) || overflowStyles.has(style.overflowY)) {
        this.scrollPositions.set(current, {
          x: current.scrollLeft,
          y: current.scrollTop
        });
      }
      current = current.parentElement;
    }
    this.scrollPositions.set(window, {
      x: window.scrollX,
      y: window.scrollY
    });
    window.addEventListener("scroll", this.onElementScroll, {
      capture: true
    });
    window.addEventListener("scroll", this.onWindowScroll);
    this.removeScrollListeners = () => {
      window.removeEventListener("scroll", this.onElementScroll, {
        capture: true
      });
      window.removeEventListener("scroll", this.onWindowScroll);
    };
  }
  /**
   * Handle scroll compensation during drag.
   *
   * For element scroll: adjusts history origin since pageX/pageY doesn't change.
   * For window scroll: adjusts lastMoveEventInfo since pageX/pageY would change.
   */
  handleScroll(target) {
    const initial = this.scrollPositions.get(target);
    if (!initial)
      return;
    const isWindow = target === window;
    const current = isWindow ? { x: window.scrollX, y: window.scrollY } : {
      x: target.scrollLeft,
      y: target.scrollTop
    };
    const delta = { x: current.x - initial.x, y: current.y - initial.y };
    if (delta.x === 0 && delta.y === 0)
      return;
    if (isWindow) {
      if (this.lastMoveEventInfo) {
        this.lastMoveEventInfo.point.x += delta.x;
        this.lastMoveEventInfo.point.y += delta.y;
      }
    } else {
      if (this.history.length > 0) {
        this.history[0].x -= delta.x;
        this.history[0].y -= delta.y;
      }
    }
    this.scrollPositions.set(target, current);
    frame.update(this.updatePoint, true);
  }
  updateHandlers(handlers) {
    this.handlers = handlers;
  }
  end() {
    this.removeListeners && this.removeListeners();
    this.removeScrollListeners && this.removeScrollListeners();
    this.scrollPositions.clear();
    cancelFrame(this.updatePoint);
  }
};
function transformPoint(info, transformPagePoint) {
  return transformPagePoint ? { point: transformPagePoint(info.point) } : info;
}
function subtractPoint(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function getPanInfo({ point }, history) {
  return {
    point,
    delta: subtractPoint(point, lastDevicePoint(history)),
    offset: subtractPoint(point, startDevicePoint(history)),
    velocity: getVelocity(history, 0.1)
  };
}
function startDevicePoint(history) {
  return history[0];
}
function lastDevicePoint(history) {
  return history[history.length - 1];
}
function getVelocity(history, timeDelta) {
  if (history.length < 2) {
    return { x: 0, y: 0 };
  }
  let i = history.length - 1;
  let timestampedPoint = null;
  const lastPoint = lastDevicePoint(history);
  while (i >= 0) {
    timestampedPoint = history[i];
    if (lastPoint.timestamp - timestampedPoint.timestamp > secondsToMilliseconds(timeDelta)) {
      break;
    }
    i--;
  }
  if (!timestampedPoint) {
    return { x: 0, y: 0 };
  }
  if (timestampedPoint === history[0] && history.length > 2 && lastPoint.timestamp - timestampedPoint.timestamp > secondsToMilliseconds(timeDelta) * 2) {
    timestampedPoint = history[1];
  }
  const time2 = millisecondsToSeconds(lastPoint.timestamp - timestampedPoint.timestamp);
  if (time2 === 0) {
    return { x: 0, y: 0 };
  }
  const currentVelocity = {
    x: (lastPoint.x - timestampedPoint.x) / time2,
    y: (lastPoint.y - timestampedPoint.y) / time2
  };
  if (currentVelocity.x === Infinity) {
    currentVelocity.x = 0;
  }
  if (currentVelocity.y === Infinity) {
    currentVelocity.y = 0;
  }
  return currentVelocity;
}

// node_modules/framer-motion/dist/es/gestures/drag/utils/constraints.mjs
function applyConstraints(point, { min, max }, elastic) {
  if (min !== void 0 && point < min) {
    point = elastic ? mixNumber(min, point, elastic.min) : Math.max(point, min);
  } else if (max !== void 0 && point > max) {
    point = elastic ? mixNumber(max, point, elastic.max) : Math.min(point, max);
  }
  return point;
}
function calcRelativeAxisConstraints(axis, min, max) {
  return {
    min: min !== void 0 ? axis.min + min : void 0,
    max: max !== void 0 ? axis.max + max - (axis.max - axis.min) : void 0
  };
}
function calcRelativeConstraints(layoutBox, { top, left, bottom, right }) {
  return {
    x: calcRelativeAxisConstraints(layoutBox.x, left, right),
    y: calcRelativeAxisConstraints(layoutBox.y, top, bottom)
  };
}
function calcViewportAxisConstraints(layoutAxis, constraintsAxis) {
  let min = constraintsAxis.min - layoutAxis.min;
  let max = constraintsAxis.max - layoutAxis.max;
  if (constraintsAxis.max - constraintsAxis.min < layoutAxis.max - layoutAxis.min) {
    [min, max] = [max, min];
  }
  return { min, max };
}
function calcViewportConstraints(layoutBox, constraintsBox) {
  return {
    x: calcViewportAxisConstraints(layoutBox.x, constraintsBox.x),
    y: calcViewportAxisConstraints(layoutBox.y, constraintsBox.y)
  };
}
function calcOrigin(source, target) {
  let origin = 0.5;
  const sourceLength = calcLength(source);
  const targetLength = calcLength(target);
  if (targetLength > sourceLength) {
    origin = progress(target.min, target.max - sourceLength, source.min);
  } else if (sourceLength > targetLength) {
    origin = progress(source.min, source.max - targetLength, target.min);
  }
  return clamp(0, 1, origin);
}
function rebaseAxisConstraints(layout2, constraints) {
  const relativeConstraints = {};
  if (constraints.min !== void 0) {
    relativeConstraints.min = constraints.min - layout2.min;
  }
  if (constraints.max !== void 0) {
    relativeConstraints.max = constraints.max - layout2.min;
  }
  return relativeConstraints;
}
var defaultElastic = 0.35;
function resolveDragElastic(dragElastic = defaultElastic) {
  if (dragElastic === false) {
    dragElastic = 0;
  } else if (dragElastic === true) {
    dragElastic = defaultElastic;
  }
  return {
    x: resolveAxisElastic(dragElastic, "left", "right"),
    y: resolveAxisElastic(dragElastic, "top", "bottom")
  };
}
function resolveAxisElastic(dragElastic, minLabel, maxLabel) {
  return {
    min: resolvePointElastic(dragElastic, minLabel),
    max: resolvePointElastic(dragElastic, maxLabel)
  };
}
function resolvePointElastic(dragElastic, label) {
  return typeof dragElastic === "number" ? dragElastic : dragElastic[label] || 0;
}

// node_modules/framer-motion/dist/es/gestures/drag/VisualElementDragControls.mjs
var elementDragControls = /* @__PURE__ */ new WeakMap();
var VisualElementDragControls = class {
  constructor(visualElement) {
    this.openDragLock = null;
    this.isDragging = false;
    this.currentDirection = null;
    this.originPoint = { x: 0, y: 0 };
    this.constraints = false;
    this.hasMutatedConstraints = false;
    this.elastic = createBox();
    this.latestPointerEvent = null;
    this.latestPanInfo = null;
    this.visualElement = visualElement;
  }
  start(originEvent, { snapToCursor = false, distanceThreshold } = {}) {
    const { presenceContext } = this.visualElement;
    if (presenceContext && presenceContext.isPresent === false)
      return;
    const onSessionStart = (event) => {
      if (snapToCursor) {
        this.snapToCursor(extractEventInfo(event).point);
      }
      this.stopAnimation();
    };
    const onStart = (event, info) => {
      const { drag: drag2, dragPropagation, onDragStart } = this.getProps();
      if (drag2 && !dragPropagation) {
        if (this.openDragLock)
          this.openDragLock();
        this.openDragLock = setDragLock(drag2);
        if (!this.openDragLock)
          return;
      }
      this.latestPointerEvent = event;
      this.latestPanInfo = info;
      this.isDragging = true;
      this.currentDirection = null;
      this.resolveConstraints();
      if (this.visualElement.projection) {
        this.visualElement.projection.isAnimationBlocked = true;
        this.visualElement.projection.target = void 0;
      }
      eachAxis((axis) => {
        let current = this.getAxisMotionValue(axis).get() || 0;
        if (percent.test(current)) {
          const { projection } = this.visualElement;
          if (projection && projection.layout) {
            const measuredAxis = projection.layout.layoutBox[axis];
            if (measuredAxis) {
              const length = calcLength(measuredAxis);
              current = length * (parseFloat(current) / 100);
            }
          }
        }
        this.originPoint[axis] = current;
      });
      if (onDragStart) {
        frame.update(() => onDragStart(event, info), false, true);
      }
      addValueToWillChange(this.visualElement, "transform");
      const { animationState } = this.visualElement;
      animationState && animationState.setActive("whileDrag", true);
    };
    const onMove = (event, info) => {
      this.latestPointerEvent = event;
      this.latestPanInfo = info;
      const { dragPropagation, dragDirectionLock, onDirectionLock, onDrag } = this.getProps();
      if (!dragPropagation && !this.openDragLock)
        return;
      const { offset } = info;
      if (dragDirectionLock && this.currentDirection === null) {
        this.currentDirection = getCurrentDirection(offset);
        if (this.currentDirection !== null) {
          onDirectionLock && onDirectionLock(this.currentDirection);
        }
        return;
      }
      this.updateAxis("x", info.point, offset);
      this.updateAxis("y", info.point, offset);
      this.visualElement.render();
      if (onDrag) {
        frame.update(() => onDrag(event, info), false, true);
      }
    };
    const onSessionEnd = (event, info) => {
      this.latestPointerEvent = event;
      this.latestPanInfo = info;
      this.stop(event, info);
      this.latestPointerEvent = null;
      this.latestPanInfo = null;
    };
    const resumeAnimation = () => {
      const { dragSnapToOrigin: snap } = this.getProps();
      if (snap || this.constraints) {
        this.startAnimation({ x: 0, y: 0 });
      }
    };
    const { dragSnapToOrigin } = this.getProps();
    this.panSession = new PanSession(originEvent, {
      onSessionStart,
      onStart,
      onMove,
      onSessionEnd,
      resumeAnimation
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin,
      distanceThreshold,
      contextWindow: getContextWindow(this.visualElement),
      element: this.visualElement.current
    });
  }
  /**
   * @internal
   */
  stop(event, panInfo) {
    const finalEvent = event || this.latestPointerEvent;
    const finalPanInfo = panInfo || this.latestPanInfo;
    const isDragging2 = this.isDragging;
    this.cancel();
    if (!isDragging2 || !finalPanInfo || !finalEvent)
      return;
    const { velocity } = finalPanInfo;
    this.startAnimation(velocity);
    const { onDragEnd } = this.getProps();
    if (onDragEnd) {
      frame.postRender(() => onDragEnd(finalEvent, finalPanInfo));
    }
  }
  /**
   * @internal
   */
  cancel() {
    this.isDragging = false;
    const { projection, animationState } = this.visualElement;
    if (projection) {
      projection.isAnimationBlocked = false;
    }
    this.endPanSession();
    const { dragPropagation } = this.getProps();
    if (!dragPropagation && this.openDragLock) {
      this.openDragLock();
      this.openDragLock = null;
    }
    animationState && animationState.setActive("whileDrag", false);
  }
  /**
   * Clean up the pan session without modifying other drag state.
   * This is used during unmount to ensure event listeners are removed
   * without affecting projection animations or drag locks.
   * @internal
   */
  endPanSession() {
    this.panSession && this.panSession.end();
    this.panSession = void 0;
  }
  updateAxis(axis, _point, offset) {
    const { drag: drag2 } = this.getProps();
    if (!offset || !shouldDrag(axis, drag2, this.currentDirection))
      return;
    const axisValue = this.getAxisMotionValue(axis);
    let next = this.originPoint[axis] + offset[axis];
    if (this.constraints && this.constraints[axis]) {
      next = applyConstraints(next, this.constraints[axis], this.elastic[axis]);
    }
    axisValue.set(next);
  }
  resolveConstraints() {
    const { dragConstraints, dragElastic } = this.getProps();
    const layout2 = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(false) : this.visualElement.projection?.layout;
    const prevConstraints = this.constraints;
    if (dragConstraints && isRefObject(dragConstraints)) {
      if (!this.constraints) {
        this.constraints = this.resolveRefConstraints();
      }
    } else {
      if (dragConstraints && layout2) {
        this.constraints = calcRelativeConstraints(layout2.layoutBox, dragConstraints);
      } else {
        this.constraints = false;
      }
    }
    this.elastic = resolveDragElastic(dragElastic);
    if (prevConstraints !== this.constraints && !isRefObject(dragConstraints) && layout2 && this.constraints && !this.hasMutatedConstraints) {
      eachAxis((axis) => {
        if (this.constraints !== false && this.getAxisMotionValue(axis)) {
          this.constraints[axis] = rebaseAxisConstraints(layout2.layoutBox[axis], this.constraints[axis]);
        }
      });
    }
  }
  resolveRefConstraints() {
    const { dragConstraints: constraints, onMeasureDragConstraints } = this.getProps();
    if (!constraints || !isRefObject(constraints))
      return false;
    const constraintsElement = constraints.current;
    invariant(constraintsElement !== null, "If `dragConstraints` is set as a React ref, that ref must be passed to another component's `ref` prop.", "drag-constraints-ref");
    const { projection } = this.visualElement;
    if (!projection || !projection.layout)
      return false;
    if (projection.root) {
      projection.root.scroll = void 0;
      projection.root.updateScroll();
    }
    const constraintsBox = measurePageBox(constraintsElement, projection.root, this.visualElement.getTransformPagePoint());
    let measuredConstraints = calcViewportConstraints(projection.layout.layoutBox, constraintsBox);
    if (onMeasureDragConstraints) {
      const userConstraints = onMeasureDragConstraints(convertBoxToBoundingBox(measuredConstraints));
      this.hasMutatedConstraints = !!userConstraints;
      if (userConstraints) {
        measuredConstraints = convertBoundingBoxToBox(userConstraints);
      }
    }
    return measuredConstraints;
  }
  startAnimation(velocity) {
    const { drag: drag2, dragMomentum, dragElastic, dragTransition, dragSnapToOrigin, onDragTransitionEnd } = this.getProps();
    const constraints = this.constraints || {};
    const momentumAnimations = eachAxis((axis) => {
      if (!shouldDrag(axis, drag2, this.currentDirection)) {
        return;
      }
      let transition = constraints && constraints[axis] || {};
      if (dragSnapToOrigin === true || dragSnapToOrigin === axis)
        transition = { min: 0, max: 0 };
      const bounceStiffness = dragElastic ? 200 : 1e6;
      const bounceDamping = dragElastic ? 40 : 1e7;
      const inertia2 = {
        type: "inertia",
        velocity: dragMomentum ? velocity[axis] : 0,
        bounceStiffness,
        bounceDamping,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...dragTransition,
        ...transition
      };
      return this.startAxisValueAnimation(axis, inertia2);
    });
    return Promise.all(momentumAnimations).then(onDragTransitionEnd);
  }
  startAxisValueAnimation(axis, transition) {
    const axisValue = this.getAxisMotionValue(axis);
    addValueToWillChange(this.visualElement, axis);
    return axisValue.start(animateMotionValue(axis, axisValue, 0, transition, this.visualElement, false));
  }
  stopAnimation() {
    eachAxis((axis) => this.getAxisMotionValue(axis).stop());
  }
  /**
   * Drag works differently depending on which props are provided.
   *
   * - If _dragX and _dragY are provided, we output the gesture delta directly to those motion values.
   * - Otherwise, we apply the delta to the x/y motion values.
   */
  getAxisMotionValue(axis) {
    const dragKey = `_drag${axis.toUpperCase()}`;
    const props = this.visualElement.getProps();
    const externalMotionValue = props[dragKey];
    return externalMotionValue ? externalMotionValue : this.visualElement.getValue(axis, this.visualElement.latestValues[axis] ?? 0);
  }
  snapToCursor(point) {
    eachAxis((axis) => {
      const { drag: drag2 } = this.getProps();
      if (!shouldDrag(axis, drag2, this.currentDirection))
        return;
      const { projection } = this.visualElement;
      const axisValue = this.getAxisMotionValue(axis);
      if (projection && projection.layout) {
        const { min, max } = projection.layout.layoutBox[axis];
        const current = axisValue.get() || 0;
        axisValue.set(point[axis] - mixNumber(min, max, 0.5) + current);
      }
    });
  }
  /**
   * When the viewport resizes we want to check if the measured constraints
   * have changed and, if so, reposition the element within those new constraints
   * relative to where it was before the resize.
   */
  scalePositionWithinConstraints() {
    if (!this.visualElement.current)
      return;
    const { drag: drag2, dragConstraints } = this.getProps();
    const { projection } = this.visualElement;
    if (!isRefObject(dragConstraints) || !projection || !this.constraints)
      return;
    this.stopAnimation();
    const boxProgress = { x: 0, y: 0 };
    eachAxis((axis) => {
      const axisValue = this.getAxisMotionValue(axis);
      if (axisValue && this.constraints !== false) {
        const latest = axisValue.get();
        boxProgress[axis] = calcOrigin({ min: latest, max: latest }, this.constraints[axis]);
      }
    });
    const { transformTemplate } = this.visualElement.getProps();
    this.visualElement.current.style.transform = transformTemplate ? transformTemplate({}, "") : "none";
    projection.root && projection.root.updateScroll();
    projection.updateLayout();
    this.constraints = false;
    this.resolveConstraints();
    eachAxis((axis) => {
      if (!shouldDrag(axis, drag2, null))
        return;
      const axisValue = this.getAxisMotionValue(axis);
      const { min, max } = this.constraints[axis];
      axisValue.set(mixNumber(min, max, boxProgress[axis]));
    });
    this.visualElement.render();
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    elementDragControls.set(this.visualElement, this);
    const element = this.visualElement.current;
    const stopPointerListener = addPointerEvent(element, "pointerdown", (event) => {
      const { drag: drag2, dragListener = true } = this.getProps();
      const target = event.target;
      const isClickingTextInputChild = target !== element && isElementTextInput(target);
      if (drag2 && dragListener && !isClickingTextInputChild) {
        this.start(event);
      }
    });
    let stopResizeObservers;
    const measureDragConstraints = () => {
      const { dragConstraints } = this.getProps();
      if (isRefObject(dragConstraints) && dragConstraints.current) {
        this.constraints = this.resolveRefConstraints();
        if (!stopResizeObservers) {
          stopResizeObservers = startResizeObservers(element, dragConstraints.current, () => this.scalePositionWithinConstraints());
        }
      }
    };
    const { projection } = this.visualElement;
    const stopMeasureLayoutListener = projection.addEventListener("measure", measureDragConstraints);
    if (projection && !projection.layout) {
      projection.root && projection.root.updateScroll();
      projection.updateLayout();
    }
    frame.read(measureDragConstraints);
    const stopResizeListener = addDomEvent(window, "resize", () => this.scalePositionWithinConstraints());
    const stopLayoutUpdateListener = projection.addEventListener("didUpdate", (({ delta, hasLayoutChanged }) => {
      if (this.isDragging && hasLayoutChanged) {
        eachAxis((axis) => {
          const motionValue2 = this.getAxisMotionValue(axis);
          if (!motionValue2)
            return;
          this.originPoint[axis] += delta[axis].translate;
          motionValue2.set(motionValue2.get() + delta[axis].translate);
        });
        this.visualElement.render();
      }
    }));
    return () => {
      stopResizeListener();
      stopPointerListener();
      stopMeasureLayoutListener();
      stopLayoutUpdateListener && stopLayoutUpdateListener();
      stopResizeObservers && stopResizeObservers();
    };
  }
  getProps() {
    const props = this.visualElement.getProps();
    const { drag: drag2 = false, dragDirectionLock = false, dragPropagation = false, dragConstraints = false, dragElastic = defaultElastic, dragMomentum = true } = props;
    return {
      ...props,
      drag: drag2,
      dragDirectionLock,
      dragPropagation,
      dragConstraints,
      dragElastic,
      dragMomentum
    };
  }
};
function skipFirstCall(callback) {
  let isFirst = true;
  return () => {
    if (isFirst) {
      isFirst = false;
      return;
    }
    callback();
  };
}
function startResizeObservers(element, constraintsElement, onResize) {
  const stopElement = resize(element, skipFirstCall(onResize));
  const stopContainer = resize(constraintsElement, skipFirstCall(onResize));
  return () => {
    stopElement();
    stopContainer();
  };
}
function shouldDrag(direction, drag2, currentDirection) {
  return (drag2 === true || drag2 === direction) && (currentDirection === null || currentDirection === direction);
}
function getCurrentDirection(offset, lockThreshold = 10) {
  let direction = null;
  if (Math.abs(offset.y) > lockThreshold) {
    direction = "y";
  } else if (Math.abs(offset.x) > lockThreshold) {
    direction = "x";
  }
  return direction;
}

// node_modules/framer-motion/dist/es/gestures/drag/index.mjs
var DragGesture = class extends Feature {
  constructor(node) {
    super(node);
    this.removeGroupControls = noop;
    this.removeListeners = noop;
    this.controls = new VisualElementDragControls(node);
  }
  mount() {
    const { dragControls } = this.node.getProps();
    if (dragControls) {
      this.removeGroupControls = dragControls.subscribe(this.controls);
    }
    this.removeListeners = this.controls.addListeners() || noop;
  }
  update() {
    const { dragControls } = this.node.getProps();
    const { dragControls: prevDragControls } = this.node.prevProps || {};
    if (dragControls !== prevDragControls) {
      this.removeGroupControls();
      if (dragControls) {
        this.removeGroupControls = dragControls.subscribe(this.controls);
      }
    }
  }
  unmount() {
    this.removeGroupControls();
    this.removeListeners();
    if (!this.controls.isDragging) {
      this.controls.endPanSession();
    }
  }
};

// node_modules/framer-motion/dist/es/gestures/pan/index.mjs
var asyncHandler = (handler) => (event, info) => {
  if (handler) {
    frame.update(() => handler(event, info), false, true);
  }
};
var PanGesture = class extends Feature {
  constructor() {
    super(...arguments);
    this.removePointerDownListener = noop;
  }
  onPointerDown(pointerDownEvent) {
    this.session = new PanSession(pointerDownEvent, this.createPanHandlers(), {
      transformPagePoint: this.node.getTransformPagePoint(),
      contextWindow: getContextWindow(this.node)
    });
  }
  createPanHandlers() {
    const { onPanSessionStart, onPanStart, onPan, onPanEnd } = this.node.getProps();
    return {
      onSessionStart: asyncHandler(onPanSessionStart),
      onStart: asyncHandler(onPanStart),
      onMove: asyncHandler(onPan),
      onEnd: (event, info) => {
        delete this.session;
        if (onPanEnd) {
          frame.postRender(() => onPanEnd(event, info));
        }
      }
    };
  }
  mount() {
    this.removePointerDownListener = addPointerEvent(this.node.current, "pointerdown", (event) => this.onPointerDown(event));
  }
  update() {
    this.session && this.session.updateHandlers(this.createPanHandlers());
  }
  unmount() {
    this.removePointerDownListener();
    this.session && this.session.end();
  }
};

// node_modules/framer-motion/dist/es/motion/features/layout/MeasureLayout.mjs
import { jsx as jsx5 } from "react/jsx-runtime";
import { useContext as useContext8, Component as Component2 } from "react";
var hasTakenAnySnapshot = false;
var MeasureLayoutWithContext = class extends Component2 {
  /**
   * This only mounts projection nodes for components that
   * need measuring, we might want to do it for all components
   * in order to incorporate transforms
   */
  componentDidMount() {
    const { visualElement, layoutGroup, switchLayoutGroup, layoutId } = this.props;
    const { projection } = visualElement;
    if (projection) {
      if (layoutGroup.group)
        layoutGroup.group.add(projection);
      if (switchLayoutGroup && switchLayoutGroup.register && layoutId) {
        switchLayoutGroup.register(projection);
      }
      if (hasTakenAnySnapshot) {
        projection.root.didUpdate();
      }
      projection.addEventListener("animationComplete", () => {
        this.safeToRemove();
      });
      projection.setOptions({
        ...projection.options,
        layoutDependency: this.props.layoutDependency,
        onExitComplete: () => this.safeToRemove()
      });
    }
    globalProjectionState.hasEverUpdated = true;
  }
  getSnapshotBeforeUpdate(prevProps) {
    const { layoutDependency, visualElement, drag: drag2, isPresent } = this.props;
    const { projection } = visualElement;
    if (!projection)
      return null;
    projection.isPresent = isPresent;
    if (prevProps.layoutDependency !== layoutDependency) {
      projection.setOptions({
        ...projection.options,
        layoutDependency
      });
    }
    hasTakenAnySnapshot = true;
    if (drag2 || prevProps.layoutDependency !== layoutDependency || layoutDependency === void 0 || prevProps.isPresent !== isPresent) {
      projection.willUpdate();
    } else {
      this.safeToRemove();
    }
    if (prevProps.isPresent !== isPresent) {
      if (isPresent) {
        projection.promote();
      } else if (!projection.relegate()) {
        frame.postRender(() => {
          const stack = projection.getStack();
          if (!stack || !stack.members.length) {
            this.safeToRemove();
          }
        });
      }
    }
    return null;
  }
  componentDidUpdate() {
    const { visualElement, layoutAnchor } = this.props;
    const { projection } = visualElement;
    if (projection) {
      projection.options.layoutAnchor = layoutAnchor;
      projection.root.didUpdate();
      microtask.postRender(() => {
        if (!projection.currentAnimation && projection.isLead()) {
          this.safeToRemove();
        }
      });
    }
  }
  componentWillUnmount() {
    const { visualElement, layoutGroup, switchLayoutGroup: promoteContext } = this.props;
    const { projection } = visualElement;
    hasTakenAnySnapshot = true;
    if (projection) {
      projection.scheduleCheckAfterUnmount();
      if (layoutGroup && layoutGroup.group)
        layoutGroup.group.remove(projection);
      if (promoteContext && promoteContext.deregister)
        promoteContext.deregister(projection);
    }
  }
  safeToRemove() {
    const { safeToRemove } = this.props;
    safeToRemove && safeToRemove();
  }
  render() {
    return null;
  }
};
function MeasureLayout(props) {
  const [isPresent, safeToRemove] = usePresence();
  const layoutGroup = useContext8(LayoutGroupContext);
  return jsx5(MeasureLayoutWithContext, { ...props, layoutGroup, switchLayoutGroup: useContext8(SwitchLayoutGroupContext), isPresent, safeToRemove });
}

// node_modules/framer-motion/dist/es/motion/features/drag.mjs
var drag = {
  pan: {
    Feature: PanGesture
  },
  drag: {
    Feature: DragGesture,
    ProjectionNode: HTMLProjectionNode,
    MeasureLayout
  }
};

// node_modules/framer-motion/dist/es/gestures/hover.mjs
function handleHoverEvent(node, event, lifecycle) {
  const { props } = node;
  if (node.animationState && props.whileHover) {
    node.animationState.setActive("whileHover", lifecycle === "Start");
  }
  const eventName = "onHover" + lifecycle;
  const callback = props[eventName];
  if (callback) {
    frame.postRender(() => callback(event, extractEventInfo(event)));
  }
}
var HoverGesture = class extends Feature {
  mount() {
    const { current } = this.node;
    if (!current)
      return;
    this.unmount = hover(current, (_element, startEvent) => {
      handleHoverEvent(this.node, startEvent, "Start");
      return (endEvent) => handleHoverEvent(this.node, endEvent, "End");
    });
  }
  unmount() {
  }
};

// node_modules/framer-motion/dist/es/gestures/focus.mjs
var FocusGesture = class extends Feature {
  constructor() {
    super(...arguments);
    this.isActive = false;
  }
  onFocus() {
    let isFocusVisible = false;
    try {
      isFocusVisible = this.node.current.matches(":focus-visible");
    } catch (e) {
      isFocusVisible = true;
    }
    if (!isFocusVisible || !this.node.animationState)
      return;
    this.node.animationState.setActive("whileFocus", true);
    this.isActive = true;
  }
  onBlur() {
    if (!this.isActive || !this.node.animationState)
      return;
    this.node.animationState.setActive("whileFocus", false);
    this.isActive = false;
  }
  mount() {
    this.unmount = pipe(addDomEvent(this.node.current, "focus", () => this.onFocus()), addDomEvent(this.node.current, "blur", () => this.onBlur()));
  }
  unmount() {
  }
};

// node_modules/framer-motion/dist/es/gestures/press.mjs
function handlePressEvent(node, event, lifecycle) {
  const { props } = node;
  if (node.current instanceof HTMLButtonElement && node.current.disabled) {
    return;
  }
  if (node.animationState && props.whileTap) {
    node.animationState.setActive("whileTap", lifecycle === "Start");
  }
  const eventName = "onTap" + (lifecycle === "End" ? "" : lifecycle);
  const callback = props[eventName];
  if (callback) {
    frame.postRender(() => callback(event, extractEventInfo(event)));
  }
}
var PressGesture = class extends Feature {
  mount() {
    const { current } = this.node;
    if (!current)
      return;
    const { globalTapTarget, propagate } = this.node.props;
    this.unmount = press(current, (_element, startEvent) => {
      handlePressEvent(this.node, startEvent, "Start");
      return (endEvent, { success }) => handlePressEvent(this.node, endEvent, success ? "End" : "Cancel");
    }, {
      useGlobalTarget: globalTapTarget,
      stopPropagation: propagate?.tap === false
    });
  }
  unmount() {
  }
};

// node_modules/framer-motion/dist/es/motion/features/viewport/observers.mjs
var observerCallbacks = /* @__PURE__ */ new WeakMap();
var observers = /* @__PURE__ */ new WeakMap();
var fireObserverCallback = (entry) => {
  const callback = observerCallbacks.get(entry.target);
  callback && callback(entry);
};
var fireAllObserverCallbacks = (entries) => {
  entries.forEach(fireObserverCallback);
};
function initIntersectionObserver({ root, ...options }) {
  const lookupRoot = root || document;
  if (!observers.has(lookupRoot)) {
    observers.set(lookupRoot, {});
  }
  const rootObservers = observers.get(lookupRoot);
  const key = JSON.stringify(options);
  if (!rootObservers[key]) {
    rootObservers[key] = new IntersectionObserver(fireAllObserverCallbacks, { root, ...options });
  }
  return rootObservers[key];
}
function observeIntersection(element, options, callback) {
  const rootInteresectionObserver = initIntersectionObserver(options);
  observerCallbacks.set(element, callback);
  rootInteresectionObserver.observe(element);
  return () => {
    observerCallbacks.delete(element);
    rootInteresectionObserver.unobserve(element);
  };
}

// node_modules/framer-motion/dist/es/motion/features/viewport/index.mjs
var thresholdNames = {
  some: 0,
  all: 1
};
var InViewFeature = class extends Feature {
  constructor() {
    super(...arguments);
    this.hasEnteredView = false;
    this.isInView = false;
  }
  startObserver() {
    this.stopObserver?.();
    const { viewport = {} } = this.node.getProps();
    const { root, margin: rootMargin, amount = "some", once } = viewport;
    const options = {
      root: root ? root.current : void 0,
      rootMargin,
      threshold: typeof amount === "number" ? amount : thresholdNames[amount]
    };
    const onIntersectionUpdate = (entry) => {
      const { isIntersecting } = entry;
      if (this.isInView === isIntersecting)
        return;
      this.isInView = isIntersecting;
      if (once && !isIntersecting && this.hasEnteredView) {
        return;
      } else if (isIntersecting) {
        this.hasEnteredView = true;
      }
      if (this.node.animationState) {
        this.node.animationState.setActive("whileInView", isIntersecting);
      }
      const { onViewportEnter, onViewportLeave } = this.node.getProps();
      const callback = isIntersecting ? onViewportEnter : onViewportLeave;
      callback && callback(entry);
    };
    this.stopObserver = observeIntersection(this.node.current, options, onIntersectionUpdate);
  }
  mount() {
    this.startObserver();
  }
  update() {
    if (typeof IntersectionObserver === "undefined")
      return;
    const { props, prevProps } = this.node;
    const hasOptionsChanged = ["amount", "margin", "root"].some(hasViewportOptionChanged(props, prevProps));
    if (hasOptionsChanged) {
      this.startObserver();
    }
  }
  unmount() {
    this.stopObserver?.();
    this.hasEnteredView = false;
    this.isInView = false;
  }
};
function hasViewportOptionChanged({ viewport = {} }, { viewport: prevViewport = {} } = {}) {
  return (name) => viewport[name] !== prevViewport[name];
}

// node_modules/framer-motion/dist/es/motion/features/gestures.mjs
var gestureAnimations = {
  inView: {
    Feature: InViewFeature
  },
  tap: {
    Feature: PressGesture
  },
  focus: {
    Feature: FocusGesture
  },
  hover: {
    Feature: HoverGesture
  }
};

// node_modules/framer-motion/dist/es/motion/features/layout.mjs
var layout = {
  layout: {
    ProjectionNode: HTMLProjectionNode,
    MeasureLayout
  }
};

// node_modules/framer-motion/dist/es/render/components/motion/feature-bundle.mjs
var featureBundle = {
  ...animations,
  ...gestureAnimations,
  ...drag,
  ...layout
};

// node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs
var motion = /* @__PURE__ */ createMotionProxy(featureBundle, createDomVisualElement);

// src/components/SiteFlow.tsx
import { ArrowRight as ArrowRight4 } from "lucide-react";

// src/data/mockData.ts
import {
  Code2,
  Stethoscope,
  Cpu,
  Database,
  ShieldCheck,
  Lightbulb,
  Terminal
} from "lucide-react";
var WHAT_WE_DO = [
  {
    title: "Coding",
    items: ["Python", "JavaScript", "Web development", "Mobile development", "APIs", "Databases"],
    icon: Terminal
  },
  {
    title: "Pharmacy Technology",
    items: ["Pharmacy management systems", "Drug information systems", "Medication systems", "Inventory systems", "Digital pharmacy"],
    icon: Stethoscope
  },
  {
    title: "AI",
    items: ["AI in pharmacy", "Machine learning", "AI-assisted research", "Responsible AI"],
    icon: Cpu
  },
  {
    title: "Data",
    items: ["Data analysis", "Health informatics", "Healthcare databases", "Visualization"],
    icon: Database
  },
  {
    title: "Cybersecurity",
    items: ["Healthcare security", "Privacy", "Secure software", "Responsible cybersecurity"],
    icon: ShieldCheck
  },
  {
    title: "Innovation",
    items: ["Startups", "Hackathons", "Research", "Healthcare entrepreneurship"],
    icon: Lightbulb
  }
];
var INITIAL_PROJECTS = [
  {
    id: "pharmatrack",
    category: "Pharmacy Tech",
    title: "PharmaTRACK",
    description: "Pharmacy Learning & Progress Tracking for students.",
    problem: "Students struggle to monitor academic performance and identify specific revision gaps.",
    solution: "A comprehensive system to track subjects studied, monitor academic growth, and identify strengths and weaknesses.",
    technology: ["React", "PostgreSQL", "Chart.js"],
    team: ["Education Technology Group"],
    status: "\u{1F6A7} Development",
    progress: 55
  },
  {
    id: "pharmaquiz",
    category: "Pharmacy Tech",
    title: "PharmaQUIZ",
    description: "Live Pharmacy Quiz & Competition Platform.",
    problem: "Classroom assessments lack engagement and real-time competitive dynamics.",
    solution: "Live class quizzes with scoring, ranking, and admin-led verification for pharmaceutical sciences.",
    technology: ["Socket.io", "Node.js", "React"],
    team: ["Gamification Team"],
    status: "\u{1F6A7} Development",
    progress: 70
  },
  {
    id: "curelink",
    category: "Pharmacy Tech",
    title: "Cure Link",
    description: "Healthcare / Pharmacy Connection Platform.",
    problem: "Inefficient communication channels between patients, healthcare providers, and pharmacies.",
    solution: "A digital bridge connecting the healthcare ecosystem for seamless pharmaceutical care and information exchange.",
    technology: ["Mobile App", "APIs", "Health Informatics"],
    team: ["HealthTech Research Group"],
    status: "\u{1F9EA} Research",
    progress: 25
  },
  {
    id: "tawomo",
    category: "Software Engineering",
    title: "TAWOMO",
    description: "Community-driven digital technology initiative.",
    problem: "Local communities lack tailored digital platforms for collaboration and local economic integration.",
    solution: "A scalable community technology initiative focused on local digital transformation.",
    technology: ["Full Stack", "Cloud Architecture"],
    team: ["Software Engineering Group"],
    status: "\u{1F6A7} Development",
    progress: 40
  },
  {
    id: "pharmagame-ai",
    category: "AI Lab",
    title: "PharmaGAME AI",
    description: "AI-powered gamified pharmacy learning experience.",
    problem: "Traditional learning tools are static and do not adapt to individual student knowledge levels.",
    solution: "Adaptive learning platform using AI for question generation, challenges, and knowledge analysis.",
    technology: ["Python", "Machine Learning", "GPT-4", "React"],
    team: ["AI Lab", "Education Experts"],
    status: "\u{1F9EA} Research",
    progress: 35
  },
  {
    id: "pms",
    category: "Pharmacy Tech",
    title: "Pharmacy Management System",
    description: "Modern pharmacy management platform with Ghana-focused integrations.",
    problem: "Traditional pharmacy systems are often outdated, lacks local payment integration, and have poor user experiences.",
    solution: "A cloud-based dashboard with drug inventory, stock management, barcode scanning, sales tracking, and Ghana-focused payment integration.",
    technology: ["React", "Node.js", "PostgreSQL", "Paystack"],
    team: ["Code Rx Core Team"],
    status: "\u{1F6A7} Development",
    progress: 45,
    github: "https://github.com/coderx/pms"
  },
  {
    id: "kick-live",
    category: "Software Engineering",
    title: "KICK LIVE / Rx Live",
    description: "High-performance football live-score technology platform.",
    problem: "Existing sports platforms are often cluttered and lack real-time synchronization optimized for low bandwidth.",
    solution: "A streamlined live-score platform featuring automatic league tables, match events, and admin control for custom tournaments.",
    technology: ["PostgreSQL", "Cloudflare D1", "GraphQL", "WebSockets"],
    team: ["Software Engineering Group"],
    status: "\u{1F6A7} Development",
    progress: 75
  },
  {
    id: "ai-automaton",
    category: "AI Lab",
    title: "AI Automaton",
    description: "Agentic AI system for automated healthcare workflows.",
    problem: "Healthcare administrative tasks are manual, error-prone, and time-consuming.",
    solution: "Building an intelligent agentic system capable of using AI, loop engineering, and graph engineering to automate clinical workflows.",
    technology: ["Python", "OpenAI API", "LangGraph", "Docker"],
    team: ["Code Rx AI Lab"],
    status: "\u{1F9EA} Research",
    progress: 30
  },
  {
    id: "decoder",
    category: "Competitions",
    title: "CODE Rx DECODER",
    description: "The ultimate logical and cryptographic challenge for pharmacists.",
    problem: "Pharmacists need to develop high-level logical and cryptographic thinking for secure healthcare data.",
    solution: "A 4-stage competition: Decode encoded Society documents, Verify completeness, Review content, and Suggest Improvements.",
    technology: ["Cryptography", "Logic", "Web Security"],
    team: ["Security Experts", "Legal Team"],
    status: "\u{1F7E2} Active",
    progress: 100
  }
];

// src/data/editorSchema.ts
var DEFAULT_SITE_COPY = {
  "nav.brand.before": "CODE",
  "nav.brand.accent": "Rx",
  "nav.brand.subtitle": "Society",
  "nav.portal.enter": "Member Portal",
  "nav.portal.exit": "Exit Portal",
  "nav.home": "Home",
  "nav.about": "About",
  "nav.learn": "Learn",
  "nav.projects": "Projects",
  "nav.challenges": "Challenges",
  "nav.community": "Community",
  "nav.resources": "Resources",
  "nav.terms": "Terms",
  "hero.primaryCta": "Join the Society",
  "hero.secondaryCta": "Explore the network",
  "hero.membersLabel": "Members",
  "hero.tracksValue": "06",
  "hero.tracksLabel": "Tracks",
  "hero.curiosityValue": "24/7",
  "hero.curiosityLabel": "Curiosity",
  "hero.systemLive": "Live / brand_system",
  "hero.systemCode": "CRX / 001",
  "hero.systemEstablished": "Est. Ghana",
  "hero.systemSignal": "Signal",
  "hero.buildLabel": "Build signal",
  "hero.buildCopy": "Pharmacy problems \u2192 digital solutions",
  "hero.safeTitle": "Safe by design",
  "hero.safeCopy": "Responsible tech for better care.",
  "values.eyebrow": "The operating system",
  "values.title": "One society.",
  "values.titleAccent": "Four signals.",
  "news.eyebrow": "Latest signal",
  "news.title": "What\u2019s moving",
  "news.titleAccent": "the network.",
  "about.eyebrow": "Who we are",
  "about.title": "Pharmacy thinking.",
  "about.titleAccent": "Builder energy.",
  "about.intro": "Code Rx Society is a Doctor of Pharmacy-focused technology and innovation society. We give current and future pharmacy professionals the confidence to understand technology, build with it, and use it responsibly.",
  "about.techLabel": "Technology",
  "about.careLabel": "Care first",
  "about.statusLabel": "Status",
  "about.statusValue": "Bridging two worlds",
  "about.missionLabel": "01 / Mission",
  "about.visionLabel": "02 / Vision",
  "about.mottoLabel": "Our motto",
  "tracks.eyebrow": "What we do",
  "tracks.title": "Six ways to move",
  "tracks.titleAccent": "healthcare forward.",
  "tracks.description": "Choose a track, bring a problem, and leave with something that works. Every discipline connects back to pharmacy.",
  "leadership.eyebrow": "The people behind the signal",
  "leadership.title": "Clinical minds.",
  "leadership.titleAccent": "Technical hands.",
  "leadership.description": "The people building a more useful, human, and responsible future for pharmacy.",
  "extras.eyebrow": "Connect & grow",
  "extras.title": "More ways to",
  "extras.titleAccent": "plug in.",
  "extras.partnershipsLabel": "Partnerships",
  "extras.partnershipsDescription": "We collaborate with universities, pharmacy organizations, and technology teams to bridge the gap between care and code.",
  "extras.partnershipCta": "Partner with us",
  "extras.opportunitiesLabel": "Opportunities",
  "academy.eyebrow": "Code Rx Academy",
  "academy.title": "Learn the stack.",
  "academy.titleAccent": "Build the bridge.",
  "academy.description": "A structured path for pharmacy professionals who want to move from curiosity to shipping useful healthcare technology.",
  "academy.projectCta": "See the project lab",
  "academy.pathLabel": "Learning_path / 08 modules",
  "academy.startAnywhere": "Start anywhere",
  "academy.keepBuilding": "Keep building \u2192",
  "projects.eyebrow": "Project lab",
  "projects.title": "Ideas into",
  "projects.titleAccent": "working systems.",
  "projects.description": "The central home for Code Rx initiatives \u2014 from pharmacy management to adaptive learning and AI.",
  "projects.openCase": "Open case \u2192",
  "projects.back": "Back to lab",
  "projects.missionLabel": "The mission",
  "projects.problemLabel": "01 / Problem",
  "projects.solutionLabel": "02 / Solution",
  "projects.technologyLabel": "Technology",
  "projects.teamLabel": "Team",
  "projects.linksLabel": "Project / Links",
  "projects.repositoryLabel": "Repository",
  "projects.demoLabel": "Live demo",
  "projects.contribute": "Want to help move this project forward? Join the society and contribute your perspective.",
  "projects.joinCta": "Join this project",
  "challenges.eyebrow": "Decoder challenge",
  "challenges.title": "Can you decode",
  "challenges.titleAccent": "what others can't see?",
  "challenges.description": "Push your limits in pharmacy-themed coding, cryptography, and problem-solving challenges.",
  "challenges.activeLabel": "Active / CRX-DECODER",
  "challenges.participantsLabel": "participants",
  "challenges.timeLabel": "Time remaining",
  "challenges.prizeLabel": "Prize",
  "challenges.rewardLabel": "Reward",
  "challenges.cta": "Enter challenge",
  "community.eyebrow": "Community hub",
  "community.titleAccent": "Find your people.",
  "community.cta": "Join Telegram channel",
  "resources.eyebrow": "The library",
  "resources.title": "Tools for the",
  "resources.titleAccent": "next prescription.",
  "terms.eyebrow": "Legal / society terms",
  "terms.title": "Terms",
  "terms.titleAccent": "&",
  "terms.titleAfter": "Conditions",
  "terms.tagline": "Coding the future of pharmacy",
  "terms.versionLabel": "Version",
  "terms.effectiveDateLabel": "Effective date",
  "terms.lastUpdatedLabel": "Last updated",
  "terms.effectiveDate": "22/03/2026",
  "terms.acceptanceEyebrow": "Official acceptance",
  "terms.acceptanceTitle": "Build with care. Build with purpose.",
  "terms.acceptanceDescription": "By registering for Code Rx Society membership, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.",
  "terms.acceptanceMotto": "We don't just learn pharmacy. We build what moves it forward.",
  "terms.acceptanceCopyright": "Code Rx Society \xA9 2026 / Ghana",
  "join.eyebrow": "Your next build starts here",
  "join.title": "Ready to code",
  "join.titleAccent": "the future?",
  "join.description": "Join the CODE Rx Society and turn your pharmacy perspective into something the world can use.",
  "join.primaryCta": "Join the society",
  "join.secondaryCta": "Back to top",
  "footer.brand.location": "Society / Ghana",
  "footer.description": "Equipping pharmacists with the technological skills to innovate, build, and lead in the digital healthcare era.",
  "footer.newsletterLabel": "Signal / Newsletter",
  "footer.newsletterDescription": "Updates in pharmacy tech, projects, and community events.",
  "footer.emailPlaceholder": "Your email",
  "footer.newsletterCta": "Join",
  "footer.exploreLabel": "Explore",
  "footer.explore.about": "About us",
  "footer.explore.learn": "Academy",
  "footer.explore.projects": "Project lab",
  "footer.explore.challenges": "Challenges",
  "footer.explore.community": "Community",
  "footer.resourcesLabel": "Resources",
  "footer.resources.docs": "Documentation",
  "footer.resources.research": "Research papers",
  "footer.resources.opensource": "Open source",
  "footer.resources.terms": "Terms & conditions",
  "footer.contactLabel": "Contact",
  "footer.telegramCta": "Join Telegram",
  "footer.copyright": "\xA9 2026 Code Rx Society / Ghana",
  "footer.privacy": "Privacy",
  "footer.codeOfConduct": "Code of conduct",
  "footer.terms": "Terms",
  "footer.contactModalTitle": "Contact Code Rx",
  "footer.sendMessage": "Send message",
  "footer.privacyTitle": "Privacy policy",
  "footer.privacyBody1": "We collect information you provide directly to process membership applications, communicate updates, and respond to enquiries.",
  "footer.privacyBody2": "We seek to handle personal information responsibly and in accordance with applicable Ghanaian data-protection requirements.",
  "footer.privacyBody3": "For data-related requests, contact",
  "footer.conductTitle": "Code of conduct",
  "footer.conductIntro": "Code Rx is a respectful, inclusive, and professional community focused on advancing pharmacy through technology."
};
var DEFAULT_SITE_LINKS = {
  "footer.telegram": "https://t.me/+EdRpfR1GTGNjM2Q0",
  "footer.email": "coderxsociety@gmail.com",
  "footer.phoneOne": "053 734 5524",
  "footer.phoneTwo": "050 773 0598",
  "footer.country": "Ghana"
};
var DEFAULT_MEDIA = {
  "brand.logo": { src: "/CODE%20RX11.png", alt: "Code Rx Society" },
  "brand.logoSmall": { src: "/CODE%20RX11.png", alt: "Code Rx Society" },
  // Preserve logo.png for the Home page Hero exactly as requested.
  "hero.logo": { src: "/logo.png", alt: "CODE Rx Society \u2014 Coding the Future of Pharmacy" },
  "about.logo": { src: "/CODE%20RX11.png", alt: "Code Rx Society emblem" },
  "footer.logo": { src: "/CODE%20RX11.png", alt: "Code Rx Society" }
};
var DEFAULT_SITE_DESIGN = {
  theme: {
    ink: "#ffffff",
    deep: "#f8fafc",
    panel: "#ffffff",
    panelStrong: "#f1f5f9",
    line: "#e2e8f0",
    lime: "#16a34a",
    green: "#15803d",
    mint: "#4ade80",
    text: "#0f172a",
    textSecondary: "#475569",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    cardRadius: "1.35rem",
    buttonRadius: "999px"
  },
  elements: {}
};
var getCopy = (copy, key, fallback = "") => copy?.[key] ?? DEFAULT_SITE_COPY[key] ?? fallback;
var getLink = (links, key, fallback = "") => links?.[key] ?? DEFAULT_SITE_LINKS[key] ?? fallback;
var getMedia = (media, key, fallback) => media?.[key] ?? DEFAULT_MEDIA[key] ?? fallback;

// src/data/siteState.ts
var DEFAULT_TRACKS = WHAT_WE_DO.map((track, index) => ({
  id: `track-${index + 1}`,
  title: track.title,
  items: [...track.items],
  icon: ["terminal", "stethoscope", "cpu", "database", "shield", "lightbulb"][index] || "terminal"
}));
var DEFAULT_CORE_VALUES = [
  { id: "pharmacy", title: "Pharmacy", description: "Improving pharmaceutical practice through technology.", icon: "stethoscope" },
  { id: "coding", title: "Coding", description: "Building programming and software-development skills.", icon: "code" },
  { id: "ai", title: "AI & Digital Health", description: "Exploring responsible AI and digital healthcare.", icon: "cpu" },
  { id: "innovation", title: "Innovation", description: "Turning pharmacy problems into technology solutions.", icon: "lightbulb" }
];
var DEFAULT_EXTRAS = {
  partnerships: ["UCC Pharmacy", "PharmaLink", "TechHealth", "MediCode"],
  opportunities: [
    { id: "clinical-tech-internship", title: "Clinical Tech Internship", organization: "PharmaLink AI", icon: "briefcase" },
    { id: "innovation-scholarship", title: "Tech Innovation Scholarship", organization: "Code Rx Foundation", icon: "graduation-cap" },
    { id: "startup-grant", title: "HealthTech Startup Grant", organization: "Health Launchpad", icon: "rocket" }
  ]
};
var INITIAL_SITE_CONTENT = {
  home: {
    heroTitle: "CODE Rx",
    heroSubtitle: "SOCIETY",
    heroTagline: "Coding the Future of Pharmacy",
    heroDescription: "Where Pharmacy meets Technology, Innovation & Artificial Intelligence. Join the elite community of healthcare innovators.",
    communityCount: 500,
    communityMembers: [
      { id: 1, image: "https://i.pravatar.cc/100?img=11", name: "Member 1" },
      { id: 2, image: "https://i.pravatar.cc/100?img=5", name: "Member 2" },
      { id: 3, image: "https://i.pravatar.cc/100?img=3", name: "Member 3" },
      { id: 4, image: "https://i.pravatar.cc/100?img=4", name: "Member 4" }
    ],
    latestNews: [
      { id: 1, category: "ANNOUNCEMENT", title: "New Chapter Opening at UCC", text: "We are excited to announce the expansion of Code Rx..." },
      { id: 2, category: "EVENT", title: "AI in Pharmacy Workshop", text: "Join us for a deep dive into Large Language Models..." },
      { id: 3, category: "RESEARCH", title: "Medication Safety Algorithm Published", text: "A new research paper by our Informatics team..." }
    ],
    coreValues: DEFAULT_CORE_VALUES
  },
  about: {
    mission: "To bridge Pharmacy and IT by equipping professionals with skills to create tech-driven solutions for healthcare.",
    vision: "A future where pharmacists actively participate in designing and implementing technology that improves healthcare.",
    motto: "CODING THE FUTURE OF PHARMACY",
    team: [
      { name: "Dr. Tech Pharm", role: "President", image: "https://images.unsplash.com/photo-1559839734-2b71f1e3c77e?w=400&h=400&fit=crop" },
      { name: "Sarah Script", role: "Vice President", image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&h=400&fit=crop" },
      { name: "Alex Code", role: "Technology Director", image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=400&fit=crop" },
      { name: "Elena AI", role: "AI & Data Lead", image: "https://images.unsplash.com/photo-1527613426441-4da17471b66d?w=400&h=400&fit=crop" }
    ],
    tracks: DEFAULT_TRACKS
  },
  learn: {
    steps: [
      "Pharmacy Technology",
      "Programming Fundamentals",
      "Web Development",
      "Databases",
      "APIs",
      "AI & Machine Learning",
      "Health Informatics",
      "Pharmacy Projects"
    ],
    benefits: [
      "Earn practical, portfolio-ready skills",
      "Work on real pharmacy problems",
      "Learn with a community that gets both sides"
    ]
  },
  projects: INITIAL_PROJECTS,
  challenges: {
    active: {
      id: "CRX-DECODER-001",
      title: "Database Encryption Breach",
      difficulty: "Advanced",
      participants: 37,
      timeRemaining: "04:21:18",
      prize: "\u20B5 5,000.00",
      reward: "Elite Badge",
      problem: "A critical database of drug formulas has been encrypted by a legacy system. Your task is to reverse-engineer the hashing algorithm and retrieve the salt keys before the system locks down."
    }
  },
  community: {
    hubTitle: "COMMUNITY HUB",
    description: "Connect with over 500+ pharmacists and developers around the world on our official channel.",
    telegramLink: "https://t.me/+EdRpfR1GTGNjM2Q0"
  },
  resources: {
    categories: [
      { name: "Pharmacy", items: ["Documentation", "Best Practices", "Cheat Sheets", "Video Tutorials"] },
      { name: "Coding", items: ["Documentation", "Best Practices", "Cheat Sheets", "Video Tutorials"] },
      { name: "AI", items: ["Documentation", "Best Practices", "Cheat Sheets", "Video Tutorials"] },
      { name: "Research", items: ["Documentation", "Best Practices", "Cheat Sheets", "Video Tutorials"] }
    ]
  },
  terms: {
    version: "1.0",
    lastUpdated: "22/03/2026",
    sections: [
      { id: "01", title: "ABOUT CODE Rx SOCIETY", content: `Code Rx Society ("Code Rx", "the Society", "we", "our", or "us") is a Doctor of Pharmacy-focused technology and innovation society established to promote the integration of coding, information technology, artificial intelligence, digital health, data, and emerging technologies into pharmacy and healthcare.

The Society seeks to equip current and future pharmacy professionals with technological skills that can be applied to improve:

\u2022 Pharmacy practice
\u2022 Pharmaceutical care
\u2022 Patient safety
\u2022 Medication management
\u2022 Healthcare systems
\u2022 Pharmacy education
\u2022 Research
\u2022 Health information management
\u2022 Digital health
\u2022 Pharmaceutical innovation
\u2022 Healthcare entrepreneurship

Our Motto: "Coding the Future of Pharmacy."

Our vision is to help develop pharmacists who are not only knowledgeable in medicines and patient care, but are also capable of understanding, designing, evaluating, and responsibly using technology to solve healthcare problems.` },
      { id: "02", title: "PURPOSE OF CODE Rx SOCIETY", content: `The Society exists to bridge the gap between Pharmacy and Information Technology.

Code Rx aims to:

1. Introduce pharmacy students and professionals to programming and software development.
2. Promote the use of technology in pharmacy practice.
3. Develop digital solutions for pharmacy and healthcare problems.
4. Encourage innovation and entrepreneurship among pharmacy students.
5. Promote responsible use of Artificial Intelligence in pharmacy and healthcare.
6. Encourage research involving technology, pharmacy, and healthcare.
7. Develop members' skills in coding, data analysis, databases, cybersecurity, software development, and other relevant technologies.
8. Create opportunities for members to collaborate on technology-based projects.
9. Organize coding sessions, workshops, seminars, hackathons, competitions, and technology-related events.
10. Encourage collaboration between pharmacy professionals, developers, researchers, healthcare professionals, and technology organizations.
11. Promote digital transformation within pharmacy and healthcare.
12. Encourage members to create solutions that address real-world healthcare challenges.` },
      { id: "03", title: "MEMBERSHIP", content: `Code Rx Society is primarily established for individuals interested in the intersection of Pharmacy, Healthcare, Coding, and Information Technology.

Membership categories may include:

\u2022 PharmD students
\u2022 Pharmacy graduates
\u2022 Pharmacists
\u2022 Pharmacy educators and researchers
\u2022 Healthcare professionals
\u2022 Developers and software engineers
\u2022 Technology enthusiasts
\u2022 Researchers
\u2022 Innovators
\u2022 Other individuals approved by the Society

The Society may establish specific membership categories and eligibility requirements.` },
      { id: "04", title: "MEMBERSHIP APPLICATION", content: `Applicants must provide accurate information when applying for membership.

Members must not:

\u2022 Use another person's identity.
\u2022 Provide deliberately false information.
\u2022 Impersonate another person.
\u2022 Create multiple accounts to circumvent Society restrictions.

Code Rx reserves the right to approve, reject, suspend, or terminate membership in accordance with these Terms and applicable Society policies.` },
      { id: "05", title: "MEMBER RESPONSIBILITIES", content: `Members are expected to:

\u2022 Respect other members.
\u2022 Support a positive learning environment.
\u2022 Participate constructively.
\u2022 Respect different levels of technical and pharmacy knowledge.
\u2022 Share knowledge responsibly.
\u2022 Respect intellectual property.
\u2022 Protect confidential information.
\u2022 Follow applicable laws and regulations.
\u2022 Follow legitimate instructions from Society administrators.
\u2022 Use Society resources responsibly.

Code Rx is a learning community. Members are encouraged to ask questions, experiment, make mistakes, learn from one another, and improve continuously.` },
      { id: "06", title: "CODE OF CONDUCT", content: `Code Rx expects professional and respectful behaviour.

Members must not use Society activities, platforms, or resources to:

\u2022 Bully or harass another person.
\u2022 Threaten or intimidate members.
\u2022 Sexually harass or exploit another person.
\u2022 Discriminate against members.
\u2022 Impersonate another person.
\u2022 Conduct scams or fraudulent activities.
\u2022 Deliberately spread harmful misinformation.
\u2022 Distribute illegal or malicious material.
\u2022 Spam members or Society platforms.
\u2022 Deliberately disrupt Society activities.
\u2022 Damage Society systems or resources.

Professional disagreement and constructive debate are permitted. Harassment, abuse, discrimination, and malicious conduct are not.` },
      { id: "07", title: "PHARMACY AND HEALTHCARE RESPONSIBILITY", content: `Because Code Rx operates at the intersection of technology and pharmacy, members must recognize that technology used in healthcare can directly affect patients.

Members must therefore exercise particular caution when developing or discussing:

\u2022 Medication-related software
\u2022 Clinical decision-support systems
\u2022 Drug information systems
\u2022 Pharmacy management systems
\u2022 Patient management systems
\u2022 AI healthcare applications
\u2022 Medication calculators
\u2022 Diagnostic-support tools
\u2022 Patient databases
\u2022 Electronic health records
\u2022 Health information systems

Technology developed through Code Rx should be designed with patient safety, accuracy, privacy, security, ethics, and professional standards in mind.` },
      { id: "08", title: "MEDICAL AND PHARMACEUTICAL INFORMATION", content: `Code Rx educational content, software, demonstrations, discussions, and projects must not automatically be treated as professional medical or pharmaceutical advice.

Members must not represent an experimental or educational technology project as an officially validated clinical system unless appropriate validation and authorization have been obtained.

Where a technology project could influence patient care, members should seek appropriate professional, ethical, regulatory, and technical review before real-world deployment.` },
      { id: "09", title: "CODING AND SOFTWARE DEVELOPMENT", content: `Code Rx encourages members to learn and develop skills in:

\u2022 Programming
\u2022 Web development
\u2022 Mobile application development
\u2022 Database management
\u2022 Cloud technologies
\u2022 APIs
\u2022 Data analytics
\u2022 Artificial Intelligence
\u2022 Machine learning
\u2022 Automation
\u2022 Cybersecurity
\u2022 Health informatics
\u2022 Software engineering
\u2022 Other relevant technologies

Members are responsible for ensuring that their software is used lawfully and ethically.` },
      { id: "10", title: "CYBERSECURITY AND RESPONSIBLE TECHNOLOGY USE", content: `Code Rx supports cybersecurity education and responsible security research.

Members must not use knowledge, tools, or code obtained through the Society to conduct unauthorized activities.

Without authorization, members must not:

\u2022 Access another person's account.
\u2022 Access another person's computer or server.
\u2022 Steal passwords or credentials.
\u2022 Bypass security controls.
\u2022 Deploy malware.
\u2022 Conduct phishing attacks.
\u2022 Conduct unauthorized penetration testing.
\u2022 Conduct denial-of-service attacks.
\u2022 Steal or expose private information.
\u2022 Destroy, modify, or exfiltrate data.
\u2022 Exploit vulnerabilities against systems without permission.

Cybersecurity exercises must be conducted only in authorized environments.` },
      { id: "11", title: "ARTIFICIAL INTELLIGENCE", content: `Code Rx recognizes Artificial Intelligence as an important component of the future of pharmacy and healthcare.

Members may explore AI for:

\u2022 Pharmacy education
\u2022 Research
\u2022 Drug information
\u2022 Data analysis
\u2022 Software development
\u2022 Healthcare innovation
\u2022 Automation
\u2022 Digital health
\u2022 Pharmaceutical research

However, members must use AI responsibly.

AI must not be used to:

\u2022 Facilitate illegal activity.
\u2022 Generate malicious software for unauthorized attacks.
\u2022 Commit fraud.
\u2022 Impersonate individuals.
\u2022 Violate privacy.
\u2022 Plagiarize work.
\u2022 Produce deliberately misleading healthcare information.
\u2022 Circumvent academic or competition rules.

Members remain responsible for verifying AI-generated information, particularly where the information relates to medicines, patients, clinical practice, or healthcare.` },
      { id: "12", title: "PATIENT DATA AND CONFIDENTIAL INFORMATION", content: `Because Code Rx operates within the healthcare environment, members may encounter sensitive information.

Members must not collect, access, disclose, publish, or distribute patient information without appropriate authorization and lawful basis.

Members must not place identifiable patient information into public coding repositories, AI systems, online forums, demonstrations, or other platforms without appropriate authorization and safeguards.

When developing educational or demonstration projects, members should use:

\u2022 Synthetic data
\u2022 De-identified data
\u2022 Test data

Where appropriate.` },
      { id: "13", title: "PRIVACY AND PERSONAL DATA", content: `Code Rx may collect information necessary to operate the Society, manage membership, organize activities, communicate with members, and operate digital platforms.

Personal information may include:

\u2022 Name
\u2022 Contact information
\u2022 Membership information
\u2022 Academic information where necessary
\u2022 Account information
\u2022 Event participation
\u2022 Project participation

Code Rx will seek to handle personal information responsibly and in accordance with applicable Ghanaian data-protection requirements.

A separate Code Rx Privacy Policy may provide additional information regarding collection, use, storage, protection, retention, and rights relating to personal information.` },
      { id: "14", title: "PROJECTS AND COLLABORATION", content: `Code Rx encourages members to collaborate on projects that improve pharmacy and healthcare.

Examples include:

\u2022 Pharmacy management systems
\u2022 Drug information platforms
\u2022 Medication reminder systems
\u2022 Digital health applications
\u2022 Pharmacy education tools
\u2022 Healthcare data systems
\u2022 AI-assisted pharmacy tools
\u2022 Inventory and stock-management systems
\u2022 Clinical decision-support concepts
\u2022 Research tools
\u2022 Automation systems

Before beginning a major project, participants should establish clear agreements concerning:

\u2022 Ownership
\u2022 Contributions
\u2022 Responsibilities
\u2022 Intellectual property
\u2022 Repository access
\u2022 Licensing
\u2022 Commercialization
\u2022 Revenue sharing
\u2022 Credits and attribution` },
      { id: "15", title: "INTELLECTUAL PROPERTY", content: `Members generally retain ownership of original work they independently create unless a separate agreement provides otherwise.

Members must respect the intellectual property rights of:

\u2022 Individuals
\u2022 Code Rx Society
\u2022 Universities
\u2022 Employers
\u2022 Research institutions
\u2022 Companies
\u2022 Open-source projects
\u2022 Other organizations

Members must not present another person's code, research, design, software, presentation, or other intellectual work as their own.

Open-source software must be used in accordance with its applicable licence.` },
      { id: "16", title: "CODE Rx PROJECTS", content: `Where a project is officially established, funded, commissioned, or owned by Code Rx Society, ownership and usage rights shall be determined by the relevant project agreement or Society policy.

The Society may establish separate agreements covering:

\u2022 Project ownership
\u2022 Software licensing
\u2022 Commercialization
\u2022 Publication
\u2022 Research
\u2022 Patents
\u2022 Revenue
\u2022 Sponsorship
\u2022 Contributors' rights` },
      { id: "17", title: "EVENTS, HACKATHONS AND COMPETITIONS", content: `Code Rx may organize:

\u2022 Hackathons
\u2022 Coding competitions
\u2022 Pharmacy technology challenges
\u2022 Workshops
\u2022 Seminars
\u2022 Training sessions
\u2022 Research activities
\u2022 Project demonstrations
\u2022 Innovation challenges

Additional rules may apply to individual events.

Participants may be disqualified for:

\u2022 Cheating
\u2022 Plagiarism
\u2022 Unauthorized collaboration
\u2022 Manipulation of results
\u2022 Submission of stolen work
\u2022 Impersonation
\u2022 Violation of event-specific rules` },
      { id: "18", title: "EDUCATIONAL CONTENT", content: `Code Rx may provide:

\u2022 Tutorials
\u2022 Coding exercises
\u2022 Pharmacy technology resources
\u2022 Presentations
\u2022 Research resources
\u2022 Software examples
\u2022 AI resources
\u2022 Digital health materials

Educational materials may contain errors or become outdated.

Members should independently verify important technical, pharmaceutical, clinical, legal, and regulatory information before relying on it.` },
      { id: "19", title: "THIRD-PARTY SERVICES", content: `Code Rx may use or recommend third-party platforms, including:

\u2022 GitHub
\u2022 Cloud services
\u2022 AI platforms
\u2022 Communication platforms
\u2022 Hosting services
\u2022 Database services
\u2022 Payment providers
\u2022 Learning platforms

Such services are governed by their own terms and policies.

Code Rx is not responsible for changes, outages, security incidents, or policies of third-party services outside its reasonable control.` },
      { id: "20", title: "COMMUNICATION CHANNELS", content: `Code Rx may communicate with members through:

\u2022 Email
\u2022 WhatsApp
\u2022 Telegram
\u2022 Discord
\u2022 Websites
\u2022 Mobile applications
\u2022 Social media
\u2022 Other official channels

Members must maintain respectful and professional communication.

Official communication channels may be moderated by authorized administrators.` },
      { id: "21", title: "MEMBER CONTENT", content: `Members may submit:

\u2022 Code
\u2022 Software
\u2022 Research
\u2022 Articles
\u2022 Tutorials
\u2022 Designs
\u2022 Presentations
\u2022 Videos
\u2022 Ideas
\u2022 Projects
\u2022 Other educational or technology-related content

Members are responsible for ensuring that submitted content does not unlawfully violate another person's rights.

Submitting content to Code Rx does not automatically transfer ownership of the member's intellectual property to the Society.` },
      { id: "22", title: "COMMERCIAL ACTIVITIES", content: `Code Rx may support technology entrepreneurship and the development of commercially viable pharmacy and healthcare solutions.

However, members must not use Society platforms for unauthorized:

\u2022 Fraud
\u2022 Scams
\u2022 Spam
\u2022 Illegal fundraising
\u2022 Unauthorized financial schemes
\u2022 Distribution of stolen software or content
\u2022 Malicious commercial activities

Legitimate business opportunities, sponsorships, partnerships, and commercialization projects may be permitted subject to Society approval and applicable agreements.` },
      { id: "23", title: "FEES AND PAYMENTS", content: `Some Code Rx activities may be free while others may require payment.

Where applicable, Code Rx will communicate:

\u2022 Applicable fees
\u2022 Payment method
\u2022 Payment deadline
\u2022 What the fee covers
\u2022 Refund conditions

Members should not make payments to individuals or accounts that have not been officially authorized by Code Rx.` },
      { id: "24", title: "DISCIPLINARY ACTION", content: `Where a member violates these Terms, Code Rx may take appropriate action, including:

1. Verbal or informal warning.
2. Written warning.
3. Removal of offending content.
4. Temporary restriction.
5. Suspension.
6. Removal from an event or project.
7. Termination of membership.
8. Permanent removal from the Society.
9. Referral to appropriate authorities where required.

The action taken may depend on the seriousness and circumstances of the violation.` },
      { id: "25", title: "APPEALS", content: `Members may appeal disciplinary decisions through the Society's designated internal process.

The Society may establish an independent or designated committee to review serious disciplinary matters.` },
      { id: "26", title: "DISCLAIMER", content: `Code Rx is an educational, professional-development, technology, and innovation society.

Unless expressly stated otherwise, participation in Code Rx does not constitute:

\u2022 Medical advice
\u2022 Pharmaceutical care
\u2022 Legal advice
\u2022 Financial advice
\u2022 Professional software certification
\u2022 A guarantee of employment
\u2022 A guarantee of income
\u2022 A guarantee of project success

Members remain responsible for verifying information before relying on it.` },
      { id: "27", title: "LIMITATION OF LIABILITY", content: `To the extent permitted by applicable law, Code Rx Society and its organizers, officers, administrators, volunteers, and authorized representatives shall not be responsible for losses resulting from:

\u2022 Misuse of Society resources.
\u2022 Member-created software.
\u2022 Member actions.
\u2022 Third-party platforms.
\u2022 Internet failures.
\u2022 Loss of member-created work where no backup exists.
\u2022 Unauthorized use of member accounts.
\u2022 Circumstances outside the Society's reasonable control.

Nothing in these Terms is intended to exclude liability that cannot legally be excluded.` },
      { id: "28", title: "CHANGES TO THE TERMS", content: `Code Rx may update these Terms when necessary.

Members may be notified of significant changes through official Society channels.

Continued participation after the effective date of revised Terms may constitute acceptance of the updated Terms, subject to applicable law.` },
      { id: "29", title: "GOVERNING LAW", content: `These Terms shall be interpreted in accordance with the applicable laws of the Republic of Ghana, unless a separate written agreement provides otherwise.

Code Rx will seek to operate consistently with applicable requirements relating to:

\u2022 Pharmacy and healthcare
\u2022 Data protection
\u2022 Cybersecurity
\u2022 Electronic transactions
\u2022 Intellectual property
\u2022 Technology
\u2022 Research and ethics
\u2022 Other applicable laws and regulations` },
      { id: "30", title: "SEVERABILITY", content: `If any provision of these Terms is determined to be invalid or unenforceable, the remaining provisions shall continue to apply to the extent permitted by law.` },
      { id: "31", title: "OFFICIAL CONTACT", content: `CODE Rx SOCIETY
Coding the Future of Pharmacy \u{1F48A}

Email: [Insert Official Email]
Website: [Insert Website]
Official Community: [Insert Link]
Location: Ghana` },
      { id: "32", title: "ACCEPTANCE", content: `By registering for Code Rx Society membership, participating in Society activities, accessing an official Code Rx platform, or otherwise participating in the Society, a member acknowledges that they have read, understood, and agreed to these Terms & Conditions.

CODE Rx SOCIETY
Coding the Future of Pharmacy.

We don't just learn pharmacy.
We build the technology that moves it forward. \u{1F48A}\u{1F4BB}\u{1F680}

Version: 1.0
Effective Date: 22/03/2026
Last Updated: 22/03/2026` }
    ]
  },
  extras: DEFAULT_EXTRAS,
  customBlocks: [],
  copy: DEFAULT_SITE_COPY,
  links: DEFAULT_SITE_LINKS,
  media: DEFAULT_MEDIA,
  design: DEFAULT_SITE_DESIGN
};
var normalizeSiteContent = (raw) => {
  const d = INITIAL_SITE_CONTENT;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const r = raw;
  const asObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const asArr = (v, fallback) => Array.isArray(v) ? v : fallback;
  const home = asObj(r.home);
  const about = asObj(r.about);
  const learn = asObj(r.learn);
  const challenges = asObj(r.challenges);
  const community = asObj(r.community);
  const resources = asObj(r.resources);
  const terms = asObj(r.terms);
  const extras = asObj(r.extras);
  const design = asObj(r.design);
  const designTheme = asObj(design.theme);
  const designElements = asObj(design.elements);
  const rawTracks = asArr(about.tracks, d.about.tracks);
  return {
    home: {
      ...d.home,
      ...home,
      communityMembers: asArr(home.communityMembers, d.home.communityMembers),
      latestNews: asArr(home.latestNews, d.home.latestNews),
      coreValues: asArr(home.coreValues, d.home.coreValues)
    },
    about: {
      ...d.about,
      ...about,
      team: asArr(about.team, d.about.team),
      // Older payloads included a non-serializable React icon field. Repair it
      // to a stable icon name so a legacy save can never break the live canvas.
      tracks: rawTracks.map((track, index) => ({
        ...d.about.tracks[index % d.about.tracks.length],
        ...asObj(track),
        id: typeof asObj(track).id === "string" ? asObj(track).id : `track-${index + 1}`,
        icon: typeof asObj(track).icon === "string" ? asObj(track).icon : d.about.tracks[index % d.about.tracks.length].icon,
        items: asArr(asObj(track).items, d.about.tracks[index % d.about.tracks.length].items)
      }))
    },
    learn: {
      ...d.learn,
      ...learn,
      steps: asArr(learn.steps, d.learn.steps),
      benefits: asArr(learn.benefits, d.learn.benefits)
    },
    projects: asArr(r.projects, d.projects).map((project) => ({
      ...project,
      github: typeof project?.github === "string" ? project.github : "",
      demo: typeof project?.demo === "string" ? project.demo : "",
      image: typeof project?.image === "string" ? project.image : ""
    })),
    challenges: {
      ...d.challenges,
      ...challenges,
      active: { ...d.challenges.active, ...asObj(challenges.active) }
    },
    community: { ...d.community, ...community },
    resources: {
      ...d.resources,
      ...resources,
      categories: asArr(resources.categories, d.resources.categories)
    },
    terms: {
      ...d.terms,
      ...terms,
      sections: asArr(terms.sections, d.terms.sections)
    },
    extras: {
      ...d.extras,
      ...extras,
      partnerships: asArr(extras.partnerships, d.extras.partnerships),
      opportunities: asArr(extras.opportunities, d.extras.opportunities)
    },
    customBlocks: asArr(r.customBlocks, d.customBlocks),
    copy: { ...d.copy, ...asObj(r.copy) },
    links: { ...d.links, ...asObj(r.links) },
    media: { ...d.media, ...asObj(r.media) },
    design: {
      theme: { ...d.design.theme, ...designTheme },
      elements: { ...d.design.elements, ...designElements }
    }
  };
};

// src/components/Hero.tsx
import { Activity, ArrowDown, ArrowRight, Code2 as Code22, ShieldCheck as ShieldCheck2, Sparkles, UserPlus, Zap } from "lucide-react";

// src/components/PharmacyBackground.tsx
import {
  Atom,
  Bandage,
  Beaker,
  BriefcaseMedical,
  CirclePlus,
  Cross,
  Droplet,
  Droplets,
  FlaskConical,
  FlaskRound,
  HeartPulse,
  Microscope,
  Pill,
  PillBottle,
  ShieldPlus,
  Stethoscope as Stethoscope2,
  Syringe,
  Tablets,
  TestTube,
  TestTubeDiagonal,
  TestTubes
} from "lucide-react";
import { jsx as jsx6 } from "react/jsx-runtime";
var LAYOUTS = {
  // Hero / general-purpose mix — the headline pharmacy "roaming" set.
  hero: [
    { Icon: Syringe, top: "16%", left: "3%", size: 42, dur: 26, delay: -3, opacity: 0.5, rotate: -24 },
    { Icon: PillBottle, top: "68%", left: "7%", size: 48, dur: 32, delay: -11, opacity: 0.42 },
    { Icon: Pill, top: "9%", left: "82%", size: 36, dur: 24, delay: -7, opacity: 0.5, rotate: 28 },
    { Icon: TestTubes, top: "60%", left: "88%", size: 42, dur: 30, delay: -2, opacity: 0.42 },
    { Icon: Cross, top: "37%", left: "93%", size: 28, dur: 22, delay: -14, opacity: 0.52 },
    { Icon: Droplet, top: "25%", left: "71%", size: 30, dur: 20, delay: -9, opacity: 0.55 },
    { Icon: FlaskConical, top: "78%", left: "38%", size: 36, dur: 34, delay: -5, opacity: 0.4, rotate: 12 },
    { Icon: HeartPulse, top: "8%", left: "54%", size: 28, dur: 28, delay: -16, opacity: 0.5 },
    { Icon: Bandage, top: "44%", left: "2%", size: 30, dur: 29, delay: -19, opacity: 0.4, rotate: 18 },
    { Icon: Atom, top: "82%", left: "86%", size: 34, dur: 36, delay: -8, opacity: 0.42 }
  ],
  // Lab / research mix (Academy, Projects, Resources).
  lab: [
    { Icon: TestTube, top: "14%", left: "6%", size: 36, dur: 25, delay: -4, opacity: 0.5, rotate: -20 },
    { Icon: FlaskRound, top: "70%", left: "90%", size: 40, dur: 31, delay: -12, opacity: 0.42 },
    { Icon: Beaker, top: "78%", left: "8%", size: 40, dur: 27, delay: -6, opacity: 0.45 },
    { Icon: TestTubeDiagonal, top: "24%", left: "88%", size: 34, dur: 23, delay: -15, opacity: 0.5, rotate: 24 },
    { Icon: Microscope, top: "52%", left: "92%", size: 36, dur: 33, delay: -3, opacity: 0.4 },
    { Icon: Droplets, top: "10%", left: "64%", size: 28, dur: 21, delay: -9, opacity: 0.55 },
    { Icon: Atom, top: "86%", left: "40%", size: 30, dur: 35, delay: -10, opacity: 0.4 },
    { Icon: Tablets, top: "40%", left: "3%", size: 30, dur: 28, delay: -18, opacity: 0.45 }
  ],
  // Clinic / care mix (Community, Competitions, Terms, Footer).
  clinic: [
    { Icon: Cross, top: "15%", left: "88%", size: 30, dur: 22, delay: -5, opacity: 0.5 },
    { Icon: Stethoscope2, top: "74%", left: "7%", size: 44, dur: 30, delay: -10, opacity: 0.42 },
    { Icon: HeartPulse, top: "20%", left: "8%", size: 30, dur: 24, delay: -13, opacity: 0.5 },
    { Icon: ShieldPlus, top: "62%", left: "92%", size: 36, dur: 28, delay: -7, opacity: 0.45 },
    { Icon: CirclePlus, top: "84%", left: "34%", size: 28, dur: 26, delay: -16, opacity: 0.5 },
    { Icon: Pill, top: "42%", left: "4%", size: 32, dur: 25, delay: -9, opacity: 0.48, rotate: 30 },
    { Icon: Bandage, top: "8%", left: "46%", size: 28, dur: 29, delay: -2, opacity: 0.4 },
    { Icon: BriefcaseMedical, top: "80%", left: "72%", size: 34, dur: 31, delay: -12, opacity: 0.42 }
  ]
};
var PharmacyBackground = ({
  layout: layout2 = "hero",
  className = ""
}) => {
  const items = LAYOUTS[layout2] ?? LAYOUTS.hero;
  return /* @__PURE__ */ jsx6("div", { "aria-hidden": "true", className: `pharmacy-bg ${className}`, children: items.map((item, index) => {
    const style = {
      top: item.top,
      left: item.left,
      width: item.size,
      height: item.size,
      "--bg-op": item.opacity,
      "--bg-dur": `${item.dur}s`,
      "--bg-delay": `${item.delay}s`,
      "--bg-rot": `${item.rotate ?? 0}deg`
    };
    return /* @__PURE__ */ jsx6(item.Icon, { className: "pharmacy-bg-icon", style }, index);
  }) });
};

// src/components/VisualEditorContext.tsx
import {
  createContext as createContext7,
  useContext as useContext9
} from "react";
import { jsx as jsx7, jsxs as jsxs2 } from "react/jsx-runtime";
var DEFAULT_DESIGN = {
  theme: {
    ink: "#ffffff",
    deep: "#f8fafc",
    panel: "#ffffff",
    panelStrong: "#f1f5f9",
    line: "#e2e8f0",
    lime: "#16a34a",
    green: "#15803d",
    mint: "#4ade80",
    text: "#0f172a",
    textSecondary: "#475569",
    fontFamily: "inherit",
    cardRadius: "1.35rem",
    buttonRadius: "999px"
  },
  elements: {}
};
var VisualEditorContext = createContext7({
  enabled: false,
  interactionMode: "preview",
  selected: null,
  select: () => void 0,
  design: DEFAULT_DESIGN
});
var safeElementKey = (key) => key.replace(/[^a-zA-Z0-9_.:-]/g, "");
var useVisualEditor = () => useContext9(VisualEditorContext);
var editorHandlers = (selection, context) => {
  const isEditing = context.enabled && context.interactionMode === "edit";
  const onClick = (event) => {
    if (!isEditing) return;
    event.preventDefault();
    event.stopPropagation();
    context.select(selection);
  };
  const onKeyDown = (event) => {
    if (!isEditing || event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    context.select(selection);
  };
  return {
    isEditing,
    onClick,
    onKeyDown
  };
};
var editorClass = (isEditing, selected) => isEditing ? `visual-editor-target${selected ? " is-selected" : ""}` : void 0;
var EditableText = ({
  elementKey,
  copyKey,
  label,
  children
}) => {
  const context = useVisualEditor();
  const selection = { kind: "text", elementKey, copyKey, label };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  return /* @__PURE__ */ jsx7(
    "span",
    {
      "data-site-element": safeElementKey(elementKey),
      "data-editor-label": label,
      className: editorClass(isEditing, isSelected),
      onClick,
      onKeyDown,
      role: isEditing ? "button" : void 0,
      tabIndex: isEditing ? 0 : void 0,
      children
    }
  );
};
var EditableRegion = ({
  elementKey,
  label,
  children,
  className,
  collection,
  itemIndex,
  copyKey,
  as: Tag = "div"
}) => {
  const context = useVisualEditor();
  const selection = { kind: copyKey ? "text" : collection ? "collection" : "region", elementKey, label, collection, itemIndex, copyKey };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  return /* @__PURE__ */ jsx7(
    Tag,
    {
      "data-site-element": safeElementKey(elementKey),
      "data-editor-label": label,
      className: [className, editorClass(isEditing, isSelected)].filter(Boolean).join(" "),
      onClick,
      onKeyDown,
      role: isEditing ? "button" : void 0,
      tabIndex: isEditing ? 0 : void 0,
      children
    }
  );
};
var EditableImage = ({
  elementKey,
  mediaKey,
  label,
  src,
  alt,
  className
}) => {
  const context = useVisualEditor();
  const selection = { kind: "image", elementKey, mediaKey, label };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  const props = {
    "data-site-element": safeElementKey(elementKey),
    "data-editor-label": label,
    className: [className, editorClass(isEditing, isSelected)].filter(Boolean).join(" "),
    onClick,
    onKeyDown,
    role: isEditing ? "button" : void 0,
    tabIndex: isEditing ? 0 : void 0
  };
  if (!src) return /* @__PURE__ */ jsx7("span", { ...props, "aria-label": `${label} \u2014 upload an image` });
  return /* @__PURE__ */ jsx7("img", { ...props, src, alt });
};

// src/components/Hero.tsx
import { jsx as jsx8, jsxs as jsxs3 } from "react/jsx-runtime";
var Hero = ({
  content,
  copy,
  media,
  onJoin
}) => {
  const explore = () => {
    document.getElementById("values")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const heroLogo = getMedia(media, "hero.logo", { src: "/logo.png", alt: "CODE Rx Society \u2014 Coding the Future of Pharmacy" });
  return /* @__PURE__ */ jsx8(EditableRegion, { elementKey: "hero.section", label: "Hero section", children: /* @__PURE__ */ jsxs3("section", { id: "home", className: "brand-section brand-grid min-h-[720px] pt-[4.5rem] lg:min-h-screen", children: [
    /* @__PURE__ */ jsx8(PharmacyBackground, { layout: "hero" }),
    /* @__PURE__ */ jsx8("div", { className: "brand-grid-fade absolute inset-0 opacity-70" }),
    /* @__PURE__ */ jsx8("div", { className: "brand-scanlines absolute inset-0" }),
    /* @__PURE__ */ jsx8("div", { className: "brand-glow -left-40 top-20" }),
    /* @__PURE__ */ jsx8("div", { className: "brand-glow right-[-12rem] top-[18rem] opacity-60" }),
    /* @__PURE__ */ jsxs3("div", { className: "relative z-10 mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-[1440px] items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:gap-10 lg:px-10 lg:py-20", children: [
      /* @__PURE__ */ jsxs3(motion.div, { initial: { opacity: 0, x: -28 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.7, ease: "easeOut" }, className: "max-w-3xl", children: [
        /* @__PURE__ */ jsxs3("div", { className: "brand-eyebrow mb-7", children: [
          /* @__PURE__ */ jsx8(Sparkles, { className: "h-3.5 w-3.5" }),
          /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.tagline", copyKey: "home.heroTagline", label: "Hero tagline", children: content.heroTagline })
        ] }),
        /* @__PURE__ */ jsxs3("h1", { className: "brand-title text-[clamp(4rem,10vw,8.8rem)]", children: [
          /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.title", copyKey: "home.heroTitle", label: "Hero title", children: content.heroTitle }),
          /* @__PURE__ */ jsx8("span", { className: "mt-2 block brand-gradient-text text-[0.7em]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.subtitle", copyKey: "home.heroSubtitle", label: "Hero subtitle", children: content.heroSubtitle }) })
        ] }),
        /* @__PURE__ */ jsx8("div", { className: "mt-8 max-w-2xl border-l border-[#15803d]/50 pl-5 sm:pl-6", children: /* @__PURE__ */ jsx8("p", { className: "brand-copy text-base sm:text-lg", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.description", copyKey: "home.heroDescription", label: "Hero description", children: content.heroDescription }) }) }),
        /* @__PURE__ */ jsxs3("div", { className: "mt-9 flex flex-wrap gap-3", children: [
          /* @__PURE__ */ jsxs3(motion.button, { type: "button", whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 }, onClick: onJoin, className: "brand-button", children: [
            /* @__PURE__ */ jsx8(UserPlus, { className: "h-4 w-4" }),
            /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.primary-cta", copyKey: "hero.primaryCta", label: "Hero primary button", children: getCopy(copy, "hero.primaryCta", "Join the Society") }),
            /* @__PURE__ */ jsx8(ArrowRight, { className: "h-4 w-4" })
          ] }),
          /* @__PURE__ */ jsxs3(motion.button, { type: "button", whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 }, onClick: explore, className: "brand-button brand-button--ghost", children: [
            /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.secondary-cta", copyKey: "hero.secondaryCta", label: "Hero secondary button", children: getCopy(copy, "hero.secondaryCta", "Explore the network") }),
            /* @__PURE__ */ jsx8(ArrowDown, { className: "h-4 w-4" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3(EditableRegion, { elementKey: "hero.stats", label: "Hero statistics", className: "mt-12 grid max-w-xl grid-cols-3 divide-x divide-[#15803d]/20 border-y border-[#16a34a]/20 py-5", children: [
          /* @__PURE__ */ jsxs3("div", { className: "pr-4", children: [
            /* @__PURE__ */ jsx8("p", { className: "brand-number", children: /* @__PURE__ */ jsxs3(EditableText, { elementKey: "hero.member-count", copyKey: "home.communityCount", label: "Community member count", children: [
              String(content.communityCount).padStart(3, "0"),
              "+"
            ] }) }),
            /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.members-label", copyKey: "hero.membersLabel", label: "Member statistic label", children: getCopy(copy, "hero.membersLabel", "Members") }) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "px-4", children: [
            /* @__PURE__ */ jsx8("p", { className: "brand-number", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.tracks-value", copyKey: "hero.tracksValue", label: "Tracks statistic value", children: getCopy(copy, "hero.tracksValue", "06") }) }),
            /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.tracks-label", copyKey: "hero.tracksLabel", label: "Tracks statistic label", children: getCopy(copy, "hero.tracksLabel", "Tracks") }) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "pl-4", children: [
            /* @__PURE__ */ jsx8("p", { className: "brand-number", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.curiosity-value", copyKey: "hero.curiosityValue", label: "Curiosity statistic value", children: getCopy(copy, "hero.curiosityValue", "24/7") }) }),
            /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#475569]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.curiosity-label", copyKey: "hero.curiosityLabel", label: "Curiosity statistic label", children: getCopy(copy, "hero.curiosityLabel", "Curiosity") }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3(motion.div, { initial: { opacity: 0, scale: 0.88, y: 18 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { duration: 0.9, delay: 0.12, ease: "easeOut" }, className: "relative mx-auto w-full max-w-[580px] lg:justify-self-end", children: [
        /* @__PURE__ */ jsxs3(EditableRegion, { elementKey: "hero.brand-card", label: "Hero brand card", className: "brand-card relative aspect-square overflow-hidden rounded-[2rem] border-[#16a34a]/20 bg-[#06100a]/80 p-5 shadow-[0_0_100px_rgba(91,255,32,0.09)] sm:p-8", children: [
          /* @__PURE__ */ jsx8("div", { className: "absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(184,255,61,0.22),transparent_38%)]" }),
          /* @__PURE__ */ jsx8("div", { className: "brand-grid-fine absolute inset-0 opacity-30" }),
          /* @__PURE__ */ jsx8("div", { className: "absolute inset-5 rounded-[1.35rem] border border-[#16a34a]/20 sm:inset-8" }),
          /* @__PURE__ */ jsxs3("div", { className: "absolute left-8 top-8 flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.2em] text-[#475569] sm:left-12 sm:top-12", children: [
            /* @__PURE__ */ jsx8("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-[#b8ff3d] shadow-[0_0_10px_#b8ff3d]" }),
            /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.system-live", copyKey: "hero.systemLive", label: "Hero system status", children: getCopy(copy, "hero.systemLive", "Live / brand_system") })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "absolute right-8 top-8 text-right sm:right-12 sm:top-12", children: [
            /* @__PURE__ */ jsx8("p", { className: "brand-number brand-number--lime", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.system-code", copyKey: "hero.systemCode", label: "Hero system code", children: getCopy(copy, "hero.systemCode", "CRX / 001") }) }),
            /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[0.66rem] uppercase tracking-[0.17em] text-[#64748b]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.system-established", copyKey: "hero.systemEstablished", label: "Hero established label", children: getCopy(copy, "hero.systemEstablished", "Est. Ghana") }) })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "relative flex h-full items-center justify-center", children: [
            /* @__PURE__ */ jsx8("div", { className: "absolute h-[68%] w-[68%] rounded-full border border-[#16a34a]/20 shadow-[0_0_60px_rgba(184,255,61,0.13),inset_0_0_45px_rgba(184,255,61,0.08)]" }),
            /* @__PURE__ */ jsx8("div", { className: "absolute h-[76%] w-[76%] rounded-full border border-dashed border-[#16a34a]/20" }),
            /* @__PURE__ */ jsx8(EditableImage, { elementKey: "hero.logo", mediaKey: "hero.logo", label: "Hero logo", src: heroLogo.src, alt: heroLogo.alt, className: "relative z-10 h-[74%] w-[74%] object-contain" })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "absolute bottom-8 left-8 right-8 flex items-end justify-between sm:bottom-12 sm:left-12 sm:right-12", children: [
            /* @__PURE__ */ jsxs3("div", { children: [
              /* @__PURE__ */ jsx8("p", { className: "text-[0.64rem] font-black uppercase tracking-[0.2em] text-[#64748b]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.signal-label", copyKey: "hero.systemSignal", label: "Hero signal label", children: getCopy(copy, "hero.systemSignal", "Signal") }) }),
              /* @__PURE__ */ jsx8("div", { className: "mt-2 flex items-end gap-1", children: [18, 28, 22, 35, 30, 46, 38, 54, 44].map((height, index) => /* @__PURE__ */ jsx8("span", { className: "w-1 rounded-full bg-[#b8ff3d]/70", style: { height: `${height}px` } }, index)) })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx8("span", { className: "grid h-8 w-8 place-items-center rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 text-[#15803d]", children: /* @__PURE__ */ jsx8(Code22, { className: "h-3.5 w-3.5" }) }),
              /* @__PURE__ */ jsx8("span", { className: "grid h-8 w-8 place-items-center rounded-lg border border-[#16a34a]/20 bg-[#b8ff3d]/5 text-[#15803d]", children: /* @__PURE__ */ jsx8(Activity, { className: "h-3.5 w-3.5" }) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3(motion.div, { animate: { y: [-7, 7, -7] }, transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" }, className: "brand-card absolute -bottom-7 -left-2 hidden w-52 p-4 sm:block sm:-left-8", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#15803d]", children: [
            /* @__PURE__ */ jsx8(Zap, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.build-label", copyKey: "hero.buildLabel", label: "Hero signal card label", children: getCopy(copy, "hero.buildLabel", "Build signal") })
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "mt-3 text-sm font-bold text-[#0f172a]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.build-copy", copyKey: "hero.buildCopy", label: "Hero signal card text", children: getCopy(copy, "hero.buildCopy", "Pharmacy problems \u2192 digital solutions") }) }),
          /* @__PURE__ */ jsx8("div", { className: "mt-3 h-1 overflow-hidden rounded-full bg-[#b8ff3d]/10", children: /* @__PURE__ */ jsx8("div", { className: "h-full w-[72%] rounded-full bg-[#b8ff3d] shadow-[0_0_12px_#b8ff3d]" }) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "brand-card absolute -right-2 -top-6 hidden w-44 p-4 sm:block sm:-right-7", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2 text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#475569]", children: [
            /* @__PURE__ */ jsx8(ShieldCheck2, { className: "h-3.5 w-3.5 text-[#15803d]" }),
            /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.safe-title", copyKey: "hero.safeTitle", label: "Hero safety card title", children: getCopy(copy, "hero.safeTitle", "Safe by design") })
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "mt-2 text-xs leading-relaxed text-[#475569]", children: /* @__PURE__ */ jsx8(EditableText, { elementKey: "hero.safe-copy", copyKey: "hero.safeCopy", label: "Hero safety card text", children: getCopy(copy, "hero.safeCopy", "Responsible tech for better care.") }) })
        ] })
      ] })
    ] })
  ] }) });
};

// src/components/About.tsx
import { Binary, Code2 as Code23, Cpu as Cpu2, Eye, Lightbulb as Lightbulb2, Quote, Stethoscope as Stethoscope3, Target } from "lucide-react";

// src/components/SectionLink.tsx
import { Link2 } from "lucide-react";
import { jsx as jsx9, jsxs as jsxs4 } from "react/jsx-runtime";
var SectionLink = ({ id: id3, light = false }) => /* @__PURE__ */ jsxs4(
  "a",
  {
    href: `#${id3}`,
    "aria-label": `Direct link to this section (${id3})`,
    title: `Direct link: #${id3}`,
    className: `inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] no-underline transition-colors ${light ? "border-white/30 text-white/90 hover:border-[#15803d]/60 hover:text-[#15803d]" : "border-[#16a34a]/20 text-[#475569] hover:border-[#15803d]/60 hover:text-[#15803d]"}`,
    children: [
      /* @__PURE__ */ jsx9(Link2, { className: "h-3.5 w-3.5" }),
      /* @__PURE__ */ jsxs4("span", { children: [
        "#",
        id3
      ] })
    ]
  }
);

// src/components/About.tsx
import { jsx as jsx10, jsxs as jsxs5 } from "react/jsx-runtime";
var VALUE_ICONS = {
  stethoscope: Stethoscope3,
  code: Code23,
  cpu: Cpu2,
  lightbulb: Lightbulb2
};
var ValueCards = ({ values, copy }) => {
  return /* @__PURE__ */ jsx10(EditableRegion, { elementKey: "values.section", label: "Core values section", collection: "coreValues", children: /* @__PURE__ */ jsxs5("section", { id: "values", className: "brand-section brand-section--alt py-24 sm:py-28", children: [
    /* @__PURE__ */ jsx10(PharmacyBackground, { layout: "clinic" }),
    /* @__PURE__ */ jsx10("div", { className: "brand-glow right-[-15rem] top-[-12rem] opacity-40" }),
    /* @__PURE__ */ jsxs5("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
      /* @__PURE__ */ jsxs5("div", { className: "mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end", children: [
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx10("div", { className: "brand-eyebrow mb-5", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "values.eyebrow", copyKey: "values.eyebrow", label: "Core values eyebrow", children: getCopy(copy, "values.eyebrow", "The operating system") }) }),
          /* @__PURE__ */ jsxs5("h2", { className: "brand-title max-w-2xl text-4xl sm:text-5xl lg:text-6xl", children: [
            /* @__PURE__ */ jsx10(EditableText, { elementKey: "values.title", copyKey: "values.title", label: "Core values heading", children: getCopy(copy, "values.title", "One society.") }),
            /* @__PURE__ */ jsx10("br", {}),
            /* @__PURE__ */ jsx10("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "values.title-accent", copyKey: "values.titleAccent", label: "Core values heading accent", children: getCopy(copy, "values.titleAccent", "Four signals.") }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx10(SectionLink, { id: "values" })
      ] }),
      /* @__PURE__ */ jsx10(EditableRegion, { elementKey: "values.grid", label: "Core values card grid", collection: "coreValues", className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: values.map((value, index) => {
        const Icon = VALUE_ICONS[value.icon] || Lightbulb2;
        return /* @__PURE__ */ jsxs5(EditableRegion, { elementKey: `values.card.${value.id || index}`, label: `${value.title} value card`, collection: "coreValues", className: "brand-card brand-card-hover group p-6 sm:p-7", children: [
          /* @__PURE__ */ jsxs5("div", { className: "flex items-start justify-between", children: [
            /* @__PURE__ */ jsx10("div", { className: "brand-icon", children: /* @__PURE__ */ jsx10(Icon, { className: "h-6 w-6" }) }),
            /* @__PURE__ */ jsxs5("span", { className: "brand-number", children: [
              "0",
              index + 1
            ] })
          ] }),
          /* @__PURE__ */ jsx10("h3", { className: "mt-9 text-xl font-black tracking-tight text-[#0f172a]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: `values.card.${value.id || index}.title`, copyKey: `home.coreValues.${index}.title`, label: `${value.title} title`, children: value.title }) }),
          /* @__PURE__ */ jsx10("p", { className: "mt-3 text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: `values.card.${value.id || index}.description`, copyKey: `home.coreValues.${index}.description`, label: `${value.title} description`, children: value.description }) }),
          /* @__PURE__ */ jsx10("div", { className: "mt-7 h-px w-12 bg-[#15803d]/60 transition-all duration-300 group-hover:w-20 group-hover:bg-[#15803d]" })
        ] }, value.id || index);
      }) })
    ] })
  ] }) });
};
var About = ({
  content,
  copy,
  media
}) => {
  const aboutLogo = getMedia(media, "about.logo", { src: "/CODE%20RX11.png", alt: "Code Rx Society emblem" });
  return /* @__PURE__ */ jsx10(EditableRegion, { elementKey: "about.section", label: "About section", children: /* @__PURE__ */ jsxs5("section", { id: "about", className: "brand-section brand-grid brand-grid-fine py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx10(PharmacyBackground, { layout: "lab" }),
    /* @__PURE__ */ jsx10("div", { className: "brand-glow -left-56 top-40 opacity-50" }),
    /* @__PURE__ */ jsxs5("div", { className: "relative z-10 mx-auto grid max-w-[1440px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10", children: [
      /* @__PURE__ */ jsxs5(EditableRegion, { elementKey: "about.visual", label: "About visual panel", className: "relative mx-auto w-full max-w-[520px]", children: [
        /* @__PURE__ */ jsxs5("div", { className: "brand-card relative overflow-hidden p-5 sm:p-8", children: [
          /* @__PURE__ */ jsx10("div", { className: "brand-grid-fine absolute inset-0 opacity-40" }),
          /* @__PURE__ */ jsxs5("div", { className: "relative flex aspect-square items-center justify-center rounded-2xl border border-[#16a34a]/20 bg-[#ffffff]/50", children: [
            /* @__PURE__ */ jsx10("div", { className: "absolute inset-5 rounded-xl border border-dashed border-[#16a34a]/20" }),
            /* @__PURE__ */ jsx10(EditableImage, { elementKey: "about.logo", mediaKey: "about.logo", label: "About logo", src: aboutLogo.src, alt: aboutLogo.alt, className: "relative h-[78%] w-[78%] object-contain" }),
            /* @__PURE__ */ jsx10("span", { className: "absolute left-4 top-4 brand-number", children: "RX / MISSION" }),
            /* @__PURE__ */ jsx10("span", { className: "absolute bottom-4 right-4 brand-number", children: "GHA / 2026" })
          ] }),
          /* @__PURE__ */ jsxs5("div", { className: "mt-5 grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxs5("div", { className: "rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4", children: [
              /* @__PURE__ */ jsx10(Binary, { className: "h-4 w-4 text-[#15803d]" }),
              /* @__PURE__ */ jsx10("p", { className: "mt-3 text-[0.66rem] font-black uppercase tracking-[0.15em] text-[#475569]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.technology-label", copyKey: "about.techLabel", label: "About technology label", children: getCopy(copy, "about.techLabel", "Technology") }) })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4", children: [
              /* @__PURE__ */ jsx10(Eye, { className: "h-4 w-4 text-[#15803d]" }),
              /* @__PURE__ */ jsx10("p", { className: "mt-3 text-[0.66rem] font-black uppercase tracking-[0.15em] text-[#475569]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.care-label", copyKey: "about.careLabel", label: "About care label", children: getCopy(copy, "about.careLabel", "Care first") }) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "absolute -bottom-6 -right-4 hidden rounded-xl border border-[#16a34a]/20 bg-[#f1f5f9] px-5 py-4 shadow-2xl sm:block", children: [
          /* @__PURE__ */ jsx10("p", { className: "brand-number", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.status-label", copyKey: "about.statusLabel", label: "About status label", children: getCopy(copy, "about.statusLabel", "Status") }) }),
          /* @__PURE__ */ jsx10("p", { className: "mt-1 text-sm font-bold text-[#15803d]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.status-value", copyKey: "about.statusValue", label: "About status text", children: getCopy(copy, "about.statusValue", "Bridging two worlds") }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsxs5("div", { className: "mb-5 flex items-center justify-between gap-4", children: [
          /* @__PURE__ */ jsx10("div", { className: "brand-eyebrow", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.eyebrow", copyKey: "about.eyebrow", label: "About eyebrow", children: getCopy(copy, "about.eyebrow", "Who we are") }) }),
          /* @__PURE__ */ jsx10(SectionLink, { id: "about" })
        ] }),
        /* @__PURE__ */ jsxs5("h2", { className: "brand-title text-4xl sm:text-5xl lg:text-6xl", children: [
          /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.title", copyKey: "about.title", label: "About heading", children: getCopy(copy, "about.title", "Pharmacy thinking.") }),
          /* @__PURE__ */ jsx10("br", {}),
          /* @__PURE__ */ jsx10("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.title-accent", copyKey: "about.titleAccent", label: "About heading accent", children: getCopy(copy, "about.titleAccent", "Builder energy.") }) })
        ] }),
        /* @__PURE__ */ jsx10("p", { className: "brand-copy mt-7 max-w-2xl text-base sm:text-lg", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.intro", copyKey: "about.intro", label: "About introduction", children: getCopy(copy, "about.intro", "") }) }),
        /* @__PURE__ */ jsxs5("div", { className: "mt-10 grid gap-4 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs5(EditableRegion, { elementKey: "about.mission-card", label: "Mission card", className: "brand-card p-6", children: [
            /* @__PURE__ */ jsxs5("div", { className: "mb-5 flex items-center gap-3 text-[#15803d]", children: [
              /* @__PURE__ */ jsx10(Target, { className: "h-5 w-5" }),
              /* @__PURE__ */ jsx10("span", { className: "brand-number", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.mission-label", copyKey: "about.missionLabel", label: "Mission label", children: getCopy(copy, "about.missionLabel", "01 / Mission") }) })
            ] }),
            /* @__PURE__ */ jsx10("p", { className: "text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.mission", copyKey: "about.mission", label: "Mission", children: content.mission }) })
          ] }),
          /* @__PURE__ */ jsxs5(EditableRegion, { elementKey: "about.vision-card", label: "Vision card", className: "brand-card p-6", children: [
            /* @__PURE__ */ jsxs5("div", { className: "mb-5 flex items-center gap-3 text-[#15803d]", children: [
              /* @__PURE__ */ jsx10(Eye, { className: "h-5 w-5" }),
              /* @__PURE__ */ jsx10("span", { className: "brand-number", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.vision-label", copyKey: "about.visionLabel", label: "Vision label", children: getCopy(copy, "about.visionLabel", "02 / Vision") }) })
            ] }),
            /* @__PURE__ */ jsx10("p", { className: "text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.vision", copyKey: "about.vision", label: "Vision", children: content.vision }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "mt-8 flex items-start gap-4 border-l-2 border-[#15803d] pl-5", children: [
          /* @__PURE__ */ jsx10(Quote, { className: "mt-1 h-5 w-5 shrink-0 text-[#15803d]" }),
          /* @__PURE__ */ jsxs5("div", { children: [
            /* @__PURE__ */ jsx10("p", { className: "text-[0.66rem] font-black uppercase tracking-[0.2em] text-[#64748b]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.motto-label", copyKey: "about.mottoLabel", label: "Motto label", children: getCopy(copy, "about.mottoLabel", "Our motto") }) }),
            /* @__PURE__ */ jsx10("p", { className: "mt-2 text-lg font-black uppercase tracking-[0.04em] text-[#0f172a]", children: /* @__PURE__ */ jsx10(EditableText, { elementKey: "about.motto", copyKey: "about.motto", label: "Motto", children: content.motto }) })
          ] })
        ] })
      ] })
    ] })
  ] }) });
};

// src/components/WhatWeDo.tsx
import { ArrowUpRight, Cpu as Cpu3, Database as Database2, Lightbulb as Lightbulb3, ShieldCheck as ShieldCheck3, Stethoscope as Stethoscope4, Terminal as Terminal2 } from "lucide-react";
import { jsx as jsx11, jsxs as jsxs6 } from "react/jsx-runtime";
var TRACK_ICONS = {
  terminal: Terminal2,
  stethoscope: Stethoscope4,
  cpu: Cpu3,
  database: Database2,
  shield: ShieldCheck3,
  lightbulb: Lightbulb3
};
var WhatWeDo = ({ tracks, copy }) => {
  return /* @__PURE__ */ jsx11(EditableRegion, { elementKey: "tracks.section", label: "What we do section", collection: "tracks", children: /* @__PURE__ */ jsxs6("section", { id: "what-we-do", className: "brand-section brand-section--alt py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx11(PharmacyBackground, { layout: "hero" }),
    /* @__PURE__ */ jsxs6("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
      /* @__PURE__ */ jsxs6("div", { className: "mb-14 flex flex-col justify-between gap-5 lg:flex-row lg:items-end", children: [
        /* @__PURE__ */ jsxs6("div", { className: "max-w-3xl", children: [
          /* @__PURE__ */ jsx11("div", { className: "brand-eyebrow mb-5", children: /* @__PURE__ */ jsx11(EditableText, { elementKey: "tracks.eyebrow", copyKey: "tracks.eyebrow", label: "Tracks eyebrow", children: getCopy(copy, "tracks.eyebrow", "What we do") }) }),
          /* @__PURE__ */ jsxs6("h2", { className: "brand-title text-4xl sm:text-5xl lg:text-6xl", children: [
            /* @__PURE__ */ jsx11(EditableText, { elementKey: "tracks.title", copyKey: "tracks.title", label: "Tracks heading", children: getCopy(copy, "tracks.title", "Six ways to move") }),
            /* @__PURE__ */ jsx11("br", {}),
            /* @__PURE__ */ jsx11("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx11(EditableText, { elementKey: "tracks.title-accent", copyKey: "tracks.titleAccent", label: "Tracks heading accent", children: getCopy(copy, "tracks.titleAccent", "healthcare forward.") }) })
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "brand-copy mt-6 max-w-2xl text-base", children: /* @__PURE__ */ jsx11(EditableText, { elementKey: "tracks.description", copyKey: "tracks.description", label: "Tracks description", children: getCopy(copy, "tracks.description", "") }) })
        ] }),
        /* @__PURE__ */ jsx11(SectionLink, { id: "what-we-do" })
      ] }),
      /* @__PURE__ */ jsx11(EditableRegion, { elementKey: "tracks.grid", label: "Track card grid", collection: "tracks", className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: tracks.map((item, index) => {
        const Icon = TRACK_ICONS[item.icon] || Terminal2;
        return /* @__PURE__ */ jsxs6(EditableRegion, { elementKey: `tracks.card.${item.id || index}`, label: `${item.title} track card`, collection: "tracks", className: "brand-card brand-card-hover group relative overflow-hidden p-7 sm:p-8", children: [
          /* @__PURE__ */ jsx11("div", { className: "absolute right-0 top-0 h-32 w-32 rounded-full bg-[#15803d]/5 blur-3xl transition-all duration-500 group-hover:bg-[#15803d]/12" }),
          /* @__PURE__ */ jsxs6("div", { className: "relative z-10 flex items-start justify-between", children: [
            /* @__PURE__ */ jsx11("div", { className: "brand-icon", children: /* @__PURE__ */ jsx11(Icon, { className: "h-6 w-6" }) }),
            /* @__PURE__ */ jsxs6("span", { className: "brand-number", children: [
              "0",
              index + 1
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "relative z-10 mt-9 flex items-center justify-between gap-4", children: [
            /* @__PURE__ */ jsx11("h3", { className: "text-2xl font-black tracking-tight text-[#0f172a]", children: /* @__PURE__ */ jsx11(EditableText, { elementKey: `tracks.card.${item.id || index}.title`, copyKey: `about.tracks.${index}.title`, label: `${item.title} title`, children: item.title }) }),
            /* @__PURE__ */ jsx11(ArrowUpRight, { className: "h-5 w-5 text-[#64748b] transition-colors group-hover:text-[#15803d]" })
          ] }),
          /* @__PURE__ */ jsx11("ul", { className: "relative z-10 mt-6 space-y-3 border-t border-[#16a34a]/20 pt-5", children: item.items.map((sub, subIndex) => /* @__PURE__ */ jsxs6("li", { className: "flex items-center gap-3 text-sm text-[#475569]", children: [
            /* @__PURE__ */ jsx11("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-[#15803d] shadow-[0_0_8px_rgba(21,128,61,0.45)]" }),
            /* @__PURE__ */ jsx11(EditableText, { elementKey: `tracks.card.${item.id || index}.item.${subIndex}`, copyKey: `about.tracks.${index}.items.${subIndex}`, label: `${item.title} item ${subIndex + 1}`, children: sub })
          ] }, `${item.id}-${subIndex}`)) })
        ] }, item.id || index);
      }) })
    ] })
  ] }) });
};

// src/components/Academy.tsx
import { ArrowRight as ArrowRight2, BookOpen, CheckCircle2, Terminal as Terminal3 } from "lucide-react";
import { jsx as jsx12, jsxs as jsxs7 } from "react/jsx-runtime";
var Academy = ({ content, copy }) => {
  return /* @__PURE__ */ jsx12(EditableRegion, { elementKey: "academy.section", label: "Academy section", collection: "academy", children: /* @__PURE__ */ jsxs7("section", { id: "learn", className: "brand-section brand-grid py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx12(PharmacyBackground, { layout: "lab" }),
    /* @__PURE__ */ jsx12("div", { className: "brand-glow right-[-14rem] top-20 opacity-50" }),
    /* @__PURE__ */ jsxs7("div", { className: "relative z-10 mx-auto grid max-w-[1440px] items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10", children: [
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsxs7("div", { className: "mb-6 flex items-center justify-between gap-4 sm:justify-start sm:gap-8", children: [
          /* @__PURE__ */ jsxs7("div", { className: "brand-eyebrow", children: [
            /* @__PURE__ */ jsx12(BookOpen, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.eyebrow", copyKey: "academy.eyebrow", label: "Academy eyebrow", children: getCopy(copy, "academy.eyebrow", "Code Rx Academy") })
          ] }),
          /* @__PURE__ */ jsx12(SectionLink, { id: "learn" })
        ] }),
        /* @__PURE__ */ jsxs7("h1", { className: "brand-title text-5xl sm:text-6xl lg:text-7xl", children: [
          /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.title", copyKey: "academy.title", label: "Academy heading", children: getCopy(copy, "academy.title", "Learn the stack.") }),
          /* @__PURE__ */ jsx12("br", {}),
          /* @__PURE__ */ jsx12("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.title-accent", copyKey: "academy.titleAccent", label: "Academy heading accent", children: getCopy(copy, "academy.titleAccent", "Build the bridge.") }) })
        ] }),
        /* @__PURE__ */ jsx12("p", { className: "brand-copy mt-7 max-w-xl text-base sm:text-lg", children: /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.description", copyKey: "academy.description", label: "Academy description", children: getCopy(copy, "academy.description", "") }) }),
        /* @__PURE__ */ jsx12(EditableRegion, { elementKey: "academy.benefits", label: "Academy benefits", collection: "academyBenefits", className: "mt-9 space-y-4", children: content.benefits.map((item, index) => /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-3 text-sm font-bold text-[#334155]", children: [
          /* @__PURE__ */ jsx12(CheckCircle2, { className: "h-5 w-5 text-[#15803d]" }),
          /* @__PURE__ */ jsx12(EditableText, { elementKey: `academy.benefit.${index}`, copyKey: `learn.benefits.${index}`, label: `Academy benefit ${index + 1}`, children: item })
        ] }, `${item}-${index}`)) }),
        /* @__PURE__ */ jsxs7("a", { href: "#projects", className: "brand-button mt-10", children: [
          /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.project-cta", copyKey: "academy.projectCta", label: "Academy project button", children: getCopy(copy, "academy.projectCta", "See the project lab") }),
          /* @__PURE__ */ jsx12(ArrowRight2, { className: "h-4 w-4" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs7(EditableRegion, { elementKey: "academy.path-card", label: "Learning path card", collection: "academySteps", className: "brand-card relative overflow-hidden p-5 sm:p-8", children: [
        /* @__PURE__ */ jsx12("div", { className: "absolute right-0 top-0 h-64 w-64 rounded-full bg-[#15803d]/8 blur-3xl" }),
        /* @__PURE__ */ jsxs7("div", { className: "relative mb-7 flex items-center justify-between border-b border-[#16a34a]/20 pb-5", children: [
          /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx12(Terminal3, { className: "h-4 w-4 text-[#15803d]" }),
            /* @__PURE__ */ jsx12("span", { className: "brand-number", children: /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.path-label", copyKey: "academy.pathLabel", label: "Learning path label", children: getCopy(copy, "academy.pathLabel", "Learning_path / 08 modules") }) })
          ] }),
          /* @__PURE__ */ jsx12("span", { className: "h-2 w-2 rounded-full bg-[#15803d] shadow-[0_0_12px_rgba(21,128,61,0.45)]" })
        ] }),
        /* @__PURE__ */ jsx12("div", { className: "relative space-y-2", children: content.steps.map((step, index) => /* @__PURE__ */ jsxs7("div", { className: "group flex items-center gap-4 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-[#16a34a]/20 hover:bg-[#15803d]/5 sm:px-4 sm:py-3.5", children: [
          /* @__PURE__ */ jsx12("span", { className: "brand-number w-8 shrink-0", children: String(index + 1).padStart(2, "0") }),
          /* @__PURE__ */ jsx12("span", { className: "h-px w-5 bg-[#15803d]/30 transition-all group-hover:w-8 group-hover:bg-[#15803d]" }),
          /* @__PURE__ */ jsx12("span", { className: "text-sm font-bold text-[#334155] transition-colors group-hover:text-[#15803d]", children: /* @__PURE__ */ jsx12(EditableText, { elementKey: `academy.step.${index}`, copyKey: `learn.steps.${index}`, label: `Learning module ${index + 1}`, children: step }) })
        ] }, `${step}-${index}`)) }),
        /* @__PURE__ */ jsxs7("div", { className: "relative mt-7 flex items-center justify-between border-t border-[#16a34a]/20 pt-5 text-[0.65rem] font-black uppercase tracking-[0.17em] text-[#64748b]", children: [
          /* @__PURE__ */ jsx12("span", { children: /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.start-anywhere", copyKey: "academy.startAnywhere", label: "Academy start label", children: getCopy(copy, "academy.startAnywhere", "Start anywhere") }) }),
          /* @__PURE__ */ jsx12("span", { className: "text-[#15803d]", children: /* @__PURE__ */ jsx12(EditableText, { elementKey: "academy.keep-building", copyKey: "academy.keepBuilding", label: "Academy keep building label", children: getCopy(copy, "academy.keepBuilding", "Keep building \u2192") }) })
        ] })
      ] })
    ] })
  ] }) });
};

// src/components/Projects.tsx
import { useState as useState2 } from "react";
import { ArrowLeft, ArrowRight as ArrowRight3, Code2 as Code24, ExternalLink, Globe, Layers3, Users, Trophy } from "lucide-react";

// src/components/ClientPortalEntry.tsx
import { ArrowUpRight as ArrowUpRight2, KeyRound } from "lucide-react";

// src/lib/cloudflare.ts
var API_BASE = (define_import_meta_env_default.VITE_API_URL || "").replace(/\/$/, "");
var TOKEN_KEY = "codeRx_token";
var ApiError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
};
var getToken = () => localStorage.getItem(TOKEN_KEY);
async function apiCall(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Is the API running?", 0);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status);
  }
  if (data === null) {
    throw new ApiError("The authentication service returned an invalid response.", response.status);
  }
  return data;
}
var db = {
  applications: {
    create: (data) => apiCall("/api/applications", { method: "POST", body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall("/api/applications");
      return result.data || [];
    },
    updateStatus: (id3, status) => apiCall(`/api/applications/${id3}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    remove: (id3) => apiCall(`/api/applications/${id3}`, { method: "DELETE" })
  },
  subscribers: {
    create: (data) => apiCall("/api/subscribers", { method: "POST", body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall("/api/subscribers");
      return result.data || [];
    },
    remove: (id3) => apiCall(`/api/subscribers/${id3}`, { method: "DELETE" })
  },
  contacts: {
    create: (data) => apiCall("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
    getAll: async () => {
      const result = await apiCall("/api/contacts");
      return result.data || [];
    },
    updateStatus: (id3, status) => apiCall(`/api/contacts/${id3}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    remove: (id3) => apiCall(`/api/contacts/${id3}`, { method: "DELETE" })
  },
  siteContent: {
    /** Returns the content object, or null if none has been saved yet. */
    get: async () => {
      const result = await apiCall("/api/site-content");
      return result.data ?? null;
    },
    update: (data) => apiCall("/api/site-content", { method: "PUT", body: JSON.stringify(data) })
  },
  members: {
    getAll: async () => {
      const result = await apiCall("/api/members");
      return result.data || [];
    },
    create: (data) => apiCall("/api/members", { method: "POST", body: JSON.stringify(data) }),
    update: (id3, data) => apiCall(`/api/members/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id3) => apiCall(`/api/members/${id3}`, { method: "DELETE" })
  },
  member: {
    me: async () => {
      const result = await apiCall("/api/member/me");
      return result.data;
    },
    leaderboard: async (limit = 10) => (await apiCall(`/api/members/leaderboard?limit=${limit}`)).data || []
  },
  notifications: {
    inbox: async (limit = 40) => (await apiCall(`/api/notifications?limit=${limit}`)).data,
    audience: async () => (await apiCall("/api/notifications/audience")).data,
    markRead: (id3) => apiCall(`/api/notifications/${id3}/read`, { method: "POST" }),
    dismiss: (id3) => apiCall(`/api/notifications/${id3}`, { method: "DELETE" }),
    sent: async (limit = 40) => (await apiCall(`/api/notifications/sent?limit=${limit}`)).data || [],
    updateSent: (id3, data) => apiCall(`/api/notifications/sent/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteSent: (id3) => apiCall(`/api/notifications/sent/${id3}`, { method: "DELETE" }),
    send: (data) => apiCall("/api/notifications/send", { method: "POST", body: JSON.stringify(data) })
  },
  community: {
    enterPublic: (email) => apiCall("/api/community/public/enter", { method: "POST", body: JSON.stringify({ email }) }),
    publicThreads: async (query = "") => (await apiCall(`/api/community/public/threads${query ? `?q=${encodeURIComponent(query)}` : ""}`)).data || [],
    publicThread: async (id3) => (await apiCall(`/api/community/public/threads/${id3}`)).data,
    createPublicThread: (guestToken, data) => apiCall("/api/community/public/threads", { method: "POST", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify(data) }),
    replyPublicThread: (guestToken, threadId, data) => apiCall(`/api/community/public/threads/${threadId}/posts`, { method: "POST", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify(data) }),
    editPublicThread: (guestToken, id3, data) => apiCall(`/api/community/public/threads/${id3}`, { method: "PATCH", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify(data) }),
    deletePublicThread: (guestToken, id3) => apiCall(`/api/community/public/threads/${id3}`, { method: "DELETE", headers: { "X-Code-Rx-Community-Guest": guestToken } }),
    editPublicPost: (guestToken, id3, body) => apiCall(`/api/community/public/posts/${id3}`, { method: "PATCH", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify({ body }) }),
    deletePublicPost: (guestToken, id3) => apiCall(`/api/community/public/posts/${id3}`, { method: "DELETE", headers: { "X-Code-Rx-Community-Guest": guestToken } }),
    reactPublicPost: (guestToken, postId, emoji) => apiCall(`/api/community/public/posts/${postId}/reactions`, { method: "PUT", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify({ emoji }) }),
    reportPublic: (guestToken, data) => apiCall("/api/community/public/reports", { method: "POST", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify(data) }),
    publicChat: async () => (await apiCall("/api/community/public/chat")).data || [],
    sendPublicChat: (guestToken, body) => apiCall("/api/community/public/chat", { method: "POST", headers: { "X-Code-Rx-Community-Guest": guestToken }, body: JSON.stringify({ body }) }),
    members: async (query = "") => (await apiCall(`/api/community/members${query ? `?q=${encodeURIComponent(query)}` : ""}`)).data || [],
    conversations: async () => (await apiCall("/api/community/conversations")).data || [],
    openDm: async (profileId) => (await apiCall(`/api/community/dms/${profileId}`, { method: "POST" })).data,
    groups: async () => (await apiCall("/api/community/groups")).data || [],
    group: async (id3) => (await apiCall(`/api/community/groups/${id3}`)).data,
    createGroup: (data) => apiCall("/api/community/groups", { method: "POST", body: JSON.stringify(data) }),
    joinGroup: (id3, message) => apiCall(`/api/community/groups/${id3}/join`, { method: "POST", body: JSON.stringify({ message }) }),
    groupRequests: async (id3) => (await apiCall(`/api/community/groups/${id3}/requests`)).data || [],
    reviewGroupRequest: (groupId, requestId, action) => apiCall(`/api/community/groups/${groupId}/requests/${requestId}`, { method: "POST", body: JSON.stringify({ action }) }),
    updateGroup: (id3, data) => apiCall(`/api/community/groups/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateGroupMember: (groupId, profileId, data) => apiCall(`/api/community/groups/${groupId}/members/${profileId}`, { method: "PUT", body: JSON.stringify(data) }),
    messages: async (conversationId, before) => (await apiCall(`/api/community/conversations/${conversationId}/messages${before ? `?before=${before}` : ""}`)).data,
    sendMessage: (conversationId, data) => apiCall(`/api/community/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify(data) }),
    editMessage: (id3, body) => apiCall(`/api/community/messages/${id3}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    deleteMessage: (id3) => apiCall(`/api/community/messages/${id3}`, { method: "DELETE" }),
    reactMessage: (id3, emoji) => apiCall(`/api/community/messages/${id3}/reactions`, { method: "PUT", body: JSON.stringify({ emoji }) }),
    markRead: (conversationId, messageId) => apiCall(`/api/community/conversations/${conversationId}/read`, { method: "POST", body: JSON.stringify({ messageId }) }),
    pinMessage: (id3) => apiCall(`/api/community/messages/${id3}/pin`, { method: "POST" }),
    reportMessage: (id3, reason) => apiCall(`/api/community/messages/${id3}/reports`, { method: "POST", body: JSON.stringify({ reason }) }),
    search: async (query) => (await apiCall(`/api/community/search?q=${encodeURIComponent(query)}`)).data,
    telegramLink: async () => (await apiCall("/api/community/telegram/link", { method: "POST" })).data,
    telegramStatus: async () => (await apiCall("/api/community/telegram/status")).data,
    disconnectTelegram: () => apiCall("/api/community/telegram/link", { method: "DELETE" }),
    mediaPolicy: async (conversationId) => (await apiCall(`/api/community/conversations/${conversationId}/media-policy`)).data || [],
    uploadAttachment: async (conversationId, file, caption = "") => {
      const form = new FormData();
      form.append("file", file);
      if (caption) form.append("caption", caption);
      return apiCall(`/api/community/conversations/${conversationId}/attachments`, { method: "POST", body: form });
    },
    downloadAttachment: async (id3) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/community/attachments/${id3}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
        }
        throw new ApiError(data?.error || "Could not open this attachment.", response.status);
      }
      return { url: URL.createObjectURL(await response.blob()), filename: response.headers.get("content-disposition")?.match(/filename=\"?([^\";]+)/i)?.[1] || "community-attachment" };
    },
    deleteAttachment: (id3) => apiCall(`/api/community/attachments/${id3}`, { method: "DELETE" }),
    retryAttachmentTelegramSync: (id3) => apiCall(`/api/community/attachments/${id3}/telegram-sync`, { method: "POST" })
  },
  communityAdmin: {
    mediaSettings: async () => (await apiCall("/api/phantom/community/media-settings")).data,
    saveMediaSetting: (data) => apiCall("/api/phantom/community/media-settings", { method: "PUT", body: JSON.stringify(data) }),
    publicReports: async () => (await apiCall("/api/phantom/community/public/reports")).data || [],
    updatePublicReport: (id3, status) => apiCall(`/api/phantom/community/public/reports/${id3}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    moderatePublicThread: (id3, data) => apiCall(`/api/phantom/community/public/threads/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    moderatePublicPost: (id3, status) => apiCall(`/api/phantom/community/public/posts/${id3}`, { method: "PATCH", body: JSON.stringify({ status }) })
  },
  codenames: {
    ballot: async () => {
      const result = await apiCall("/api/codenames/ballot");
      return result.data;
    },
    reveal: async (slot) => {
      const result = await apiCall("/api/codenames/reveal", { method: "POST", body: JSON.stringify(slot ? { slot } : {}) });
      return result.data;
    },
    check: async (codenameId) => {
      const result = await apiCall("/api/codenames/check", { method: "POST", body: JSON.stringify({ codenameId }) });
      return result.data;
    },
    pass: async (codenameId) => {
      const result = await apiCall("/api/codenames/pass", { method: "POST", body: JSON.stringify({ codenameId }) });
      return result.data;
    },
    claim: async (codenameId) => {
      const result = await apiCall("/api/codenames/claim", { method: "POST", body: JSON.stringify({ codenameId }) });
      return result.data;
    }
  },
  vault: {
    home: async () => (await apiCall("/api/vault/home")).data,
    activity: async (limit = 30) => (await apiCall(`/api/vault/activity?limit=${limit}`)).data || [],
    search: async (query) => (await apiCall(`/api/vault/search?q=${encodeURIComponent(query)}`)).data || [],
    tags: async () => (await apiCall("/api/vault/tags")).data || [],
    sharingStatus: async () => (await apiCall("/api/vault/sharing/status")).data,
    shares: async (documentId) => (await apiCall(`/api/vault/documents/${documentId}/shares`)).data,
    createShare: (documentId, options = {}) => apiCall(`/api/vault/documents/${documentId}/shares`, {
      method: "POST",
      body: JSON.stringify({ allowDownload: options.allowDownload === true, expiresInDays: options.expiresInDays ?? null })
    }),
    replaceShare: (documentId, shareId) => apiCall(`/api/vault/documents/${documentId}/shares/${shareId}/replace`, { method: "POST" }),
    revokeShare: (documentId, shareId) => apiCall(`/api/vault/documents/${documentId}/shares/${shareId}/revoke`, { method: "POST" }),
    downloadDocument: async (documentId) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/vault/documents/${documentId}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
        }
        throw new ApiError(data?.error || "Could not download this document.", response.status);
      }
      return { url: URL.createObjectURL(await response.blob()), filename: response.headers.get("content-disposition")?.match(/filename="?([^";]+)/i)?.[1] || "code-rx-vault-document.html" };
    },
    publicShare: async (token) => (await apiCall(`/api/vault/shares/${encodeURIComponent(token)}`)).data,
    publicDownloadUrl: (token) => `${API_BASE}/api/vault/shares/${encodeURIComponent(token)}/download`,
    sections: async () => {
      const result = await apiCall("/api/vault/sections");
      return result.data || [];
    },
    uploadFile: async (file, section, documentId) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section", section);
      if (documentId) formData.append("documentId", String(documentId));
      return apiCall("/api/vault/upload", { method: "POST", body: formData });
    },
    fetchFile: async (fileKey) => {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/vault-files/${encodeURIComponent(fileKey).replace(/%2F/g, "/")}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
        }
        throw new ApiError(data?.error || "Could not open Vault attachment.", response.status);
      }
      return URL.createObjectURL(await response.blob());
    },
    documents: async (section, archived = false) => {
      const result = await apiCall(`/api/vault/documents?section=${encodeURIComponent(section)}${archived ? "&archived=1" : ""}`);
      return result.data || [];
    },
    document: async (id3) => {
      const result = await apiCall(`/api/vault/documents/${id3}`);
      return result.data;
    },
    createDocument: (data) => apiCall("/api/vault/documents", { method: "POST", body: JSON.stringify(data) }),
    updateDocument: (id3, data) => apiCall(`/api/vault/documents/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    archiveDocument: (id3) => apiCall("/api/vault/documents/" + id3, { method: "DELETE" }),
    unarchiveDocument: (id3) => apiCall("/api/vault/documents/" + id3 + "/unarchive", { method: "POST" }),
    documentVersions: async (id3) => (await apiCall(`/api/vault/documents/${id3}/versions`)).data || [],
    documentVersion: async (id3, version) => (await apiCall(`/api/vault/documents/${id3}/versions/${version}`)).data,
    restoreDocumentVersion: (id3, version) => apiCall(`/api/vault/documents/${id3}/restore/${version}`, { method: "POST" }),
    projects: async (archived = false) => {
      const result = await apiCall(`/api/vault/projects${archived ? "?archived=1" : ""}`);
      return result.data || [];
    },
    createProject: (data) => apiCall("/api/vault/projects", { method: "POST", body: JSON.stringify(data) }),
    updateProject: (id3, data) => apiCall(`/api/vault/projects/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    project: async (id3) => (await apiCall(`/api/vault/projects/${id3}`)).data,
    createTask: (projectId, data) => apiCall(`/api/vault/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
    meetings: async () => (await apiCall("/api/vault/meetings")).data || [],
    createMeeting: (data) => apiCall("/api/vault/meetings", { method: "POST", body: JSON.stringify(data) })
  },
  phantom: {
    overview: async () => (await apiCall("/api/phantom/overview")).data,
    applications: async () => (await apiCall("/api/phantom/applications")).data || [],
    reviewApplication: (id3, status, note) => apiCall(`/api/applications/${id3}`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
    approveAndInviteApplication: (id3, data) => apiCall(`/api/phantom/applications/${id3}/approve-and-invite`, { method: "POST", body: JSON.stringify(data) }),
    // Retained as a compatibility name for older PHANTOM UI paths. It now uses
    // the unified approval + secure invitation endpoint.
    createFromApplication: (id3, data) => apiCall(`/api/phantom/applications/${id3}/approve-and-invite`, { method: "POST", body: JSON.stringify(data) }),
    createMember: (data) => apiCall("/api/phantom/members", { method: "POST", body: JSON.stringify(data) }),
    regenerateActivationLink: (profileId) => apiCall(`/api/phantom/members/${profileId}/activation-link`, { method: "POST" }),
    reassignCodename: (profileId, codenameId) => apiCall(`/api/phantom/members/${profileId}/codename`, { method: "POST", body: JSON.stringify({ codenameId }) }),
    members: async (status) => (await apiCall(`/api/phantom/members${status ? `?status=${encodeURIComponent(status)}` : ""}`)).data || [],
    updateMember: (id3, data) => apiCall(`/api/phantom/members/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    memberHistory: async (id3) => (await apiCall(`/api/phantom/members/${id3}/history`)).data,
    scoreHistory: async (id3) => (await apiCall(`/api/phantom/members/${id3}/score-history`)).data || [],
    adjustScore: (id3, data) => apiCall(`/api/phantom/members/${id3}/score`, { method: "POST", body: JSON.stringify(data) }),
    scoreRules: async () => (await apiCall("/api/phantom/score-rules")).data || [],
    calLevels: async () => (await apiCall("/api/phantom/cal-levels")).data || [],
    saveCalLevels: (levels) => apiCall("/api/phantom/cal-levels", { method: "PUT", body: JSON.stringify({ levels }) }),
    updateScoreRule: (key, data) => apiCall(`/api/phantom/score-rules/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(data) }),
    sharing: async () => (await apiCall("/api/phantom/sharing")).data,
    setGlobalSharing: (enabled) => apiCall("/api/phantom/sharing/global", { method: "PUT", body: JSON.stringify({ enabled }) }),
    setGlobalDownloads: (enabled) => apiCall("/api/phantom/downloads/global", { method: "PUT", body: JSON.stringify({ enabled }) }),
    setMemberSharing: (id3, canShare) => apiCall(`/api/phantom/members/${id3}/sharing`, { method: "PUT", body: JSON.stringify({ canShare }) }),
    setMemberDownloads: (id3, canDownload) => apiCall(`/api/phantom/members/${id3}/downloads`, { method: "PUT", body: JSON.stringify({ canDownload }) }),
    notificationDelegates: async () => (await apiCall("/api/phantom/notification-delegates")).data || [],
    setNotificationDelegate: (id3, canSend) => apiCall(`/api/phantom/notification-delegates/${id3}`, { method: "PUT", body: JSON.stringify({ canSend }) }),
    roles: async () => (await apiCall("/api/phantom/roles")).data,
    createRole: (data) => apiCall("/api/phantom/roles", { method: "POST", body: JSON.stringify(data) }),
    updateRoleProfile: (id3, data) => apiCall(`/api/phantom/roles/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateRolePermissions: (id3, permissions) => apiCall(`/api/phantom/roles/${id3}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) }),
    updateMemberPermissions: (id3, permissions) => apiCall(`/api/phantom/members/${id3}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) }),
    websiteAdmins: async () => (await apiCall("/api/phantom/website-admins")).data,
    assignWebsiteAdmin: (data) => apiCall("/api/phantom/website-admins", { method: "POST", body: JSON.stringify(data) }),
    updateWebsiteAdmin: (id3, data) => apiCall(`/api/phantom/website-admins/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    vaultSections: async () => (await apiCall("/api/phantom/vault-sections")).data || [],
    createVaultSection: (data) => apiCall("/api/phantom/vault-sections", { method: "POST", body: JSON.stringify(data) }),
    updateVaultSection: (id3, data) => apiCall(`/api/phantom/vault-sections/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    codenames: async () => (await apiCall("/api/phantom/codenames")).data,
    addCodename: (data) => apiCall("/api/phantom/codenames", { method: "POST", body: JSON.stringify(data) }),
    addCodenamesBatch: (data) => apiCall("/api/phantom/codenames/batch", { method: "POST", body: JSON.stringify(data) }),
    assignCodename: (id3, memberProfileId) => apiCall(`/api/phantom/codenames/${id3}/assign`, { method: "POST", body: JSON.stringify({ memberProfileId }) }),
    updateCodename: (id3, data) => apiCall(`/api/phantom/codenames/${id3}`, { method: "PATCH", body: JSON.stringify(data) }),
    releaseCodename: (id3, data) => apiCall(`/api/phantom/codenames/${id3}/release`, { method: "POST", body: JSON.stringify(data) }),
    auditLogs: async (limit = 100) => (await apiCall(`/api/phantom/audit-logs?limit=${limit}`)).data || [],
    recycleBin: async (limit = 100) => (await apiCall(`/api/phantom/recycle-bin?limit=${limit}`)).data || [],
    restoreRecycleBin: (id3) => apiCall(`/api/phantom/recycle-bin/${id3}/restore`, { method: "POST" }),
    purgeRecycleBin: (id3) => apiCall(`/api/phantom/recycle-bin/${id3}`, { method: "DELETE" }),
    settings: async () => (await apiCall("/api/phantom/settings")).data || [],
    saveSetting: (key, value) => apiCall(`/api/phantom/settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) })
  },
  getStats: async () => {
    const result = await apiCall("/api/stats");
    return result.data;
  }
};
var CLIENT_SESSION_KEY = "codeRx_clientSession";
var clientPortalSession = {
  read: () => {
    try {
      const raw = sessionStorage.getItem(CLIENT_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.token) return null;
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(CLIENT_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  write: (session) => {
    try {
      sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(session));
    } catch {
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(CLIENT_SESSION_KEY);
    } catch {
    }
  }
};
var ClientPortalError = class extends Error {
  status;
  code;
  constructor(message, status, code = null) {
    super(message);
    this.name = "ClientPortalError";
    this.status = status;
    this.code = code;
  }
};

// src/lib/linkAccess.ts
var LINK_DESTINATIONS = [
  { id: "project", label: "Project Room", hint: "The whole room: every published section.", needsDocument: false, kind: "room" },
  { id: "overview", label: "Project Overview", hint: "The overview only \u2014 status, dates and the latest published items.", needsDocument: false, kind: "overview" },
  { id: "documents", label: "Documents", hint: "The Documents section only.", needsDocument: false, kind: "section" },
  { id: "letters", label: "Letters", hint: "The Letters section only.", needsDocument: false, kind: "section" },
  { id: "agreements", label: "Agreements", hint: "The Agreements section only.", needsDocument: false, kind: "section" },
  { id: "reports", label: "Reports", hint: "The Reports section only.", needsDocument: false, kind: "section" },
  { id: "deliverables", label: "Deliverables", hint: "The Deliverables section only.", needsDocument: false, kind: "section" },
  { id: "updates", label: "Updates", hint: "The Updates section only.", needsDocument: false, kind: "section" },
  { id: "document", label: "Specific document", hint: "One published document. The rest of the room stays closed.", needsDocument: true, kind: "document" },
  { id: "file", label: "Specific file", hint: "The stamped client copy of one document. Nothing else opens.", needsDocument: true, kind: "file" }
];
var LINK_DESTINATION_IDS = LINK_DESTINATIONS.map((entry) => entry.id);
var LINK_TTL_MAX_MINUTES = 7 * 24 * 60;
var LINK_CONTACT_EMAIL = "coderxsociety@gmail.com";
var contactValue = (links, key, fallback) => getLink(links, key, fallback).trim();
var clientContact = (links) => {
  const source = links ?? void 0;
  return {
    email: contactValue(source, "footer.email", LINK_CONTACT_EMAIL) || LINK_CONTACT_EMAIL,
    telegram: contactValue(source, "footer.telegram", DEFAULT_SITE_LINKS["footer.telegram"]),
    phones: [contactValue(source, "footer.phoneOne", ""), contactValue(source, "footer.phoneTwo", "")].filter(Boolean)
  };
};
var CLIENT_SITE_HOME = "/";
var PHANTOM_CONTACT_HASH = "#contact-phantom";
var phantomContactHref = () => `/${PHANTOM_CONTACT_HASH}`;
var clientSupportMailto = (email, context = "Client portal access", detail) => {
  const body = [
    "Hello Code Rx Society,",
    "",
    detail ? `I need help with: ${detail}` : "I need help with my client project access.",
    "",
    "(Please keep this message and reply with the details you need.)"
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(context)}&body=${encodeURIComponent(body)}`;
};
var CLIENT_PORTAL_HASH = "#client-portal";
var clientEntryCopy = (hasSession) => hasSession ? {
  label: "Open my project",
  hint: "Continue in your client project room",
  aria: "Continue in the client project room"
} : {
  label: "Client project room",
  hint: "Enter your project access key",
  aria: "Open the client project room with your project access key"
};

// src/components/ClientPortalEntry.tsx
import { jsx as jsx13, jsxs as jsxs8 } from "react/jsx-runtime";
var ClientPortalEntry = ({
  variant = "chip",
  label,
  hint,
  className = ""
}) => {
  const copy = clientEntryCopy(Boolean(clientPortalSession.read()));
  const text = label ?? copy.label;
  const sub = hint ?? copy.hint;
  if (variant === "icon") {
    return /* @__PURE__ */ jsx13(
      "a",
      {
        href: CLIENT_PORTAL_HASH,
        "aria-label": copy.aria,
        title: `${copy.label} \u2014 ${copy.hint}`,
        className: `grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#16a34a]/25 text-[#15803d] transition-colors hover:border-[#15803d]/60 hover:bg-[#15803d]/10 ${className}`,
        children: /* @__PURE__ */ jsx13(KeyRound, { className: "h-4 w-4" })
      }
    );
  }
  if (variant === "tile") {
    return /* @__PURE__ */ jsxs8(
      "a",
      {
        href: CLIENT_PORTAL_HASH,
        "aria-label": copy.aria,
        className: `group flex items-center gap-3 rounded-2xl border border-[#16a34a]/25 bg-emerald-50/80 p-3.5 text-left no-underline transition hover:-translate-y-0.5 hover:border-[#16a34a]/50 hover:bg-emerald-100/70 ${className}`,
        children: [
          /* @__PURE__ */ jsx13("span", { className: "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#15803d] text-[#b8ff3d] shadow-[0_7px_16px_rgba(21,128,61,0.22)]", children: /* @__PURE__ */ jsx13(KeyRound, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsxs8("span", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsx13("span", { className: "block text-xs font-black uppercase tracking-[0.12em] text-[#14532d]", children: text }),
            /* @__PURE__ */ jsx13("span", { className: "mt-1 block text-xs leading-5 text-[#475569]", children: sub })
          ] }),
          /* @__PURE__ */ jsx13(ArrowUpRight2, { className: "h-4 w-4 shrink-0 text-[#15803d] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs8(
    "a",
    {
      href: CLIENT_PORTAL_HASH,
      "aria-label": copy.aria,
      title: copy.hint,
      className: `inline-flex items-center gap-1.5 rounded-full border border-[#16a34a]/20 px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.14em] text-[#475569] no-underline transition-colors hover:border-[#15803d]/60 hover:text-[#15803d] ${className}`,
      children: [
        /* @__PURE__ */ jsx13(KeyRound, { className: "h-3.5 w-3.5" }),
        /* @__PURE__ */ jsx13("span", { children: text }),
        /* @__PURE__ */ jsx13(ArrowUpRight2, { className: "h-3.5 w-3.5" })
      ]
    }
  );
};

// src/components/SiteEmoji.tsx
import { createContext as createContext8, Fragment as Fragment4, useContext as useContext10 } from "react";

// src/data/siteEmojis.ts
var SITE_EMOJI_MEDIA_PREFIX = "emoji.";
var siteEmojiMediaKey = (key) => `${SITE_EMOJI_MEDIA_PREFIX}${key}`;
var SITE_EMOJIS = [
  { key: "status.active", emoji: "\u{1F7E2}", label: "Active marker", where: "Projects \u2014 project status" },
  { key: "status.development", emoji: "\u{1F6A7}", label: "In progress marker", where: "Projects \u2014 project status" },
  { key: "status.research", emoji: "\u{1F9EA}", label: "Research marker", where: "Projects \u2014 project status" },
  { key: "status.completed", emoji: "\u2705", label: "Completed marker", where: "Projects status and community reactions" },
  { key: "reaction.like", emoji: "\u{1F44D}", label: "Like reaction", where: "Community \u2014 reactions" },
  { key: "reaction.love", emoji: "\u2764\uFE0F", label: "Love reaction", where: "Community \u2014 reactions" },
  { key: "reaction.fire", emoji: "\u{1F525}", label: "Fire reaction", where: "Community \u2014 reactions" },
  { key: "chat.attachment", emoji: "\u{1F4CE}", label: "Attachment marker", where: "Community \u2014 chat files" },
  { key: "welcome.wave", emoji: "\u{1F44B}", label: "Welcome wave", where: "Member dashboard heading" },
  { key: "rank.trophy", emoji: "\u{1F3C6}", label: "First place", where: "Member leaderboard" },
  { key: "rank.silver", emoji: "\u{1F948}", label: "Second place", where: "Member leaderboard" },
  { key: "rank.bronze", emoji: "\u{1F949}", label: "Third place", where: "Member leaderboard" },
  { key: "copy.pill", emoji: "\u{1F48A}", label: "Pill", where: "Terms page copy" },
  { key: "copy.laptop", emoji: "\u{1F4BB}", label: "Laptop", where: "Terms page copy" },
  { key: "copy.rocket", emoji: "\u{1F680}", label: "Rocket", where: "Terms page copy" }
];
var escapeForPattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var SITE_EMOJI_BY_CHARACTER = SITE_EMOJIS.reduce(
  (map, entry) => {
    if (!map[entry.emoji]) map[entry.emoji] = entry;
    return map;
  },
  {}
);
var EMOJI_PATTERN = new RegExp(
  `(${Object.keys(SITE_EMOJI_BY_CHARACTER).sort((a, b) => b.length - a.length).map(escapeForPattern).join("|")})`,
  "g"
);
var siteEmojiEntry = (character) => character ? SITE_EMOJI_BY_CHARACTER[character] || null : null;
var splitEmojiRuns = (text) => {
  const source = String(text ?? "");
  if (!source) return [];
  return source.split(EMOJI_PATTERN).filter((part) => part !== "").map((value) => ({ type: siteEmojiEntry(value) ? "emoji" : "text", value }));
};
var siteEmojiReplacement = (media, character) => {
  const entry = siteEmojiEntry(character);
  if (!entry || !media) return null;
  const asset = media[siteEmojiMediaKey(entry.key)];
  if (!asset || !asset.src) return null;
  return { src: asset.src, alt: asset.alt || entry.label };
};

// src/components/SiteEmoji.tsx
import { Fragment as Fragment5, jsx as jsx14 } from "react/jsx-runtime";
var SiteEmojiContext = createContext8(void 0);
var useSiteEmojiMedia = () => useContext10(SiteEmojiContext);
var useSiteEmojiReplacement = (character) => {
  const media = useSiteEmojiMedia();
  return siteEmojiReplacement(media, character);
};
var SITE_EMOJI_IMAGE_CLASS = "inline-block h-[1.05em] w-[1.05em] shrink-0 align-[-0.18em] object-contain";
var SiteEmoji = ({ character, className = SITE_EMOJI_IMAGE_CLASS }) => {
  const replacement = useSiteEmojiReplacement(character);
  if (!replacement) return /* @__PURE__ */ jsx14(Fragment5, { children: character });
  return /* @__PURE__ */ jsx14(
    "img",
    {
      src: replacement.src,
      alt: replacement.alt,
      className,
      loading: "lazy",
      decoding: "async"
    }
  );
};
var SiteEmojiText = ({ text, className }) => /* @__PURE__ */ jsx14(Fragment5, { children: splitEmojiRuns(text).map(
  (run, index) => run.type === "emoji" ? /* @__PURE__ */ jsx14(SiteEmoji, { character: run.value, className: className || SITE_EMOJI_IMAGE_CLASS }, `emoji-${index}-${run.value}`) : /* @__PURE__ */ jsx14(Fragment4, { children: run.value }, `text-${index}`)
) });

// src/components/Projects.tsx
import { Fragment as Fragment6, jsx as jsx15, jsxs as jsxs9 } from "react/jsx-runtime";
var ProjectMark = ({ category, large = false }) => {
  const Icon = category === "AI Lab" ? Code24 : category === "Competitions" ? Trophy : category === "Software Engineering" ? Layers3 : Globe;
  return /* @__PURE__ */ jsx15(Icon, { className: large ? "h-24 w-24 text-[#15803d]/25" : "h-5 w-5 text-[#15803d]" });
};
var Projects = ({ projects, copy, media }) => {
  const [selectedProject, setSelectedProject] = useState2(null);
  return /* @__PURE__ */ jsx15(EditableRegion, { elementKey: "projects.section", label: "Projects section", collection: "projects", children: /* @__PURE__ */ jsxs9("section", { id: "projects", className: "brand-section brand-grid-fine min-h-screen py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx15(PharmacyBackground, { layout: "lab" }),
    /* @__PURE__ */ jsx15("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: /* @__PURE__ */ jsx15(AnimatePresence, { mode: "wait", children: !selectedProject ? /* @__PURE__ */ jsxs9(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, children: [
      /* @__PURE__ */ jsxs9("div", { className: "mb-14 flex flex-col justify-between gap-6 sm:flex-row sm:items-end", children: [
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsx15("div", { className: "brand-eyebrow mb-5", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.eyebrow", copyKey: "projects.eyebrow", label: "Projects eyebrow", children: getCopy(copy, "projects.eyebrow", "Project lab") }) }),
          /* @__PURE__ */ jsxs9("h2", { className: "brand-title text-4xl sm:text-5xl lg:text-6xl", children: [
            /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.title", copyKey: "projects.title", label: "Projects heading", children: getCopy(copy, "projects.title", "Ideas into") }),
            /* @__PURE__ */ jsx15("br", {}),
            /* @__PURE__ */ jsx15("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.title-accent", copyKey: "projects.titleAccent", label: "Projects heading accent", children: getCopy(copy, "projects.titleAccent", "working systems.") }) })
          ] }),
          /* @__PURE__ */ jsx15("p", { className: "brand-copy mt-6 max-w-2xl text-base", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.description", copyKey: "projects.description", label: "Projects description", children: getCopy(copy, "projects.description", "") }) })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "flex flex-wrap items-center gap-3 sm:justify-end", children: [
          /* @__PURE__ */ jsx15(ClientPortalEntry, { variant: "chip" }),
          /* @__PURE__ */ jsx15(SectionLink, { id: "projects" })
        ] })
      ] }),
      /* @__PURE__ */ jsx15(EditableRegion, { elementKey: "projects.grid", label: "Project card grid", collection: "projects", className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: projects.map((project, index) => {
        const image = getMedia(media, `projects.${project.id}.image`, { src: project.image || "", alt: project.title });
        return /* @__PURE__ */ jsx15(motion.button, { type: "button", whileHover: { y: -6 }, onClick: () => setSelectedProject(project), className: "brand-card brand-card-hover group flex flex-col overflow-hidden text-left", children: /* @__PURE__ */ jsxs9(EditableRegion, { elementKey: `projects.card.${project.id}`, label: `${project.title} project card`, collection: "projects", itemIndex: index, className: "contents", children: [
          /* @__PURE__ */ jsxs9("div", { className: "relative flex h-44 items-center justify-center overflow-hidden border-b border-[#16a34a]/20 bg-[#f8fafc]", children: [
            image.src ? /* @__PURE__ */ jsx15(EditableImage, { elementKey: `projects.card.${project.id}.image`, mediaKey: `projects.${project.id}.image`, label: `${project.title} image`, src: image.src, alt: image.alt || project.title, className: "absolute inset-0 h-full w-full object-cover" }) : /* @__PURE__ */ jsxs9(Fragment6, { children: [
              /* @__PURE__ */ jsx15("div", { className: "brand-grid-fine absolute inset-0 opacity-60" }),
              /* @__PURE__ */ jsx15("div", { className: "absolute inset-0 bg-[radial-gradient(circle,rgba(184,255,61,0.12),transparent_55%)]" }),
              /* @__PURE__ */ jsx15(ProjectMark, { category: project.category, large: true }),
              /* @__PURE__ */ jsx15(EditableImage, { elementKey: `projects.card.${project.id}.image`, mediaKey: `projects.${project.id}.image`, label: `${project.title} image upload`, src: "", alt: project.title, className: "absolute inset-0" })
            ] }),
            /* @__PURE__ */ jsx15("span", { className: "absolute left-5 top-5 rounded-full border border-[#16a34a]/20 bg-[#15803d]/8 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.13em] text-[#15803d]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.card.${project.id}.category`, copyKey: `projects.${index}.category`, label: `${project.title} category`, children: project.category }) }),
            /* @__PURE__ */ jsxs9("span", { className: "absolute bottom-5 right-5 brand-number", children: [
              "0",
              index + 1
            ] })
          ] }),
          /* @__PURE__ */ jsxs9("div", { className: "flex flex-grow flex-col p-6 sm:p-7", children: [
            /* @__PURE__ */ jsxs9("div", { className: "flex items-start justify-between gap-4", children: [
              /* @__PURE__ */ jsx15("h3", { className: "text-xl font-black tracking-tight text-[#0f172a]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.card.${project.id}.title`, copyKey: `projects.${index}.title`, label: `${project.title} title`, children: project.title }) }),
              /* @__PURE__ */ jsx15(ArrowRight3, { className: "h-5 w-5 shrink-0 text-[#64748b] transition-all group-hover:translate-x-1 group-hover:text-[#15803d]" })
            ] }),
            /* @__PURE__ */ jsx15("p", { className: "mt-3 flex-grow text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.card.${project.id}.description`, copyKey: `projects.${index}.description`, label: `${project.title} description`, children: project.description }) }),
            /* @__PURE__ */ jsx15("div", { className: "mt-6 flex flex-wrap gap-2", children: project.technology.slice(0, 3).map((tech, techIndex) => /* @__PURE__ */ jsx15("span", { className: "rounded-md border border-[#16a34a]/20 bg-[#15803d]/5 px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-wide text-[#475569]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.card.${project.id}.technology.${techIndex}`, copyKey: `projects.${index}.technology.${techIndex}`, label: `${project.title} technology ${techIndex + 1}`, children: tech }) }, techIndex)) }),
            /* @__PURE__ */ jsxs9("div", { className: "mt-6 flex items-center justify-between border-t border-[#16a34a]/20 pt-4", children: [
              /* @__PURE__ */ jsx15("span", { className: "text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#64748b]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.card.${project.id}.status`, copyKey: `projects.${index}.status`, label: `${project.title} status`, children: /* @__PURE__ */ jsx15(SiteEmojiText, { text: project.status }) }) }),
              /* @__PURE__ */ jsx15("span", { className: "text-[0.65rem] font-black uppercase tracking-[0.15em] text-[#15803d]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.open-case", copyKey: "projects.openCase", label: "Open project label", children: getCopy(copy, "projects.openCase", "Open case \u2192") }) })
            ] })
          ] })
        ] }) }, project.id);
      }) })
    ] }, "list") : /* @__PURE__ */ jsxs9(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, className: "mx-auto max-w-6xl", children: [
      /* @__PURE__ */ jsxs9("div", { className: "mb-10 flex flex-wrap items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs9("button", { type: "button", onClick: () => setSelectedProject(null), className: "flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#475569] transition-colors hover:text-[#15803d]", children: [
          /* @__PURE__ */ jsx15(ArrowLeft, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.back", copyKey: "projects.back", label: "Back to projects label", children: getCopy(copy, "projects.back", "Back to lab") })
        ] }),
        /* @__PURE__ */ jsx15(ClientPortalEntry, { variant: "chip" })
      ] }),
      /* @__PURE__ */ jsxs9(EditableRegion, { elementKey: `projects.detail.${selectedProject.id}`, label: `${selectedProject.title} project details`, collection: "projects", className: "grid gap-12 lg:grid-cols-[1fr_320px]", children: [
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsxs9("div", { className: "brand-eyebrow mb-5", children: [
            /* @__PURE__ */ jsx15(ProjectMark, { category: selectedProject.category }),
            " ",
            /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.detail.${selectedProject.id}.category`, copyKey: `projects.${projects.indexOf(selectedProject)}.category`, label: "Project category", children: selectedProject.category })
          ] }),
          /* @__PURE__ */ jsx15("h1", { className: "brand-title text-5xl sm:text-6xl", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.detail.${selectedProject.id}.title`, copyKey: `projects.${projects.indexOf(selectedProject)}.title`, label: "Project title", children: selectedProject.title }) }),
          /* @__PURE__ */ jsxs9("div", { className: "mt-6 flex flex-wrap items-center gap-4 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-[#475569]", children: [
            /* @__PURE__ */ jsx15("span", { className: "text-[#15803d]", children: /* @__PURE__ */ jsx15(SiteEmojiText, { text: selectedProject.status }) }),
            /* @__PURE__ */ jsx15("span", { className: "h-1 w-1 rounded-full bg-[#15803d]/40" }),
            /* @__PURE__ */ jsxs9("span", { className: "brand-mono", children: [
              "Progress: ",
              /* @__PURE__ */ jsxs9(EditableText, { elementKey: `projects.detail.${selectedProject.id}.progress`, copyKey: `projects.${projects.indexOf(selectedProject)}.progress`, label: "Project progress", children: [
                selectedProject.progress,
                "%"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx15("div", { className: "mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#15803d]/10", children: /* @__PURE__ */ jsx15(motion.div, { initial: { width: 0 }, animate: { width: `${selectedProject.progress}%` }, className: "h-full rounded-full bg-[#15803d] shadow-[0_0_14px_rgba(21,128,61,0.45)]" }) }),
          /* @__PURE__ */ jsxs9("div", { className: "brand-card mt-12 p-7 sm:p-10", children: [
            /* @__PURE__ */ jsx15("div", { className: "brand-eyebrow mb-7", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.mission-label", copyKey: "projects.missionLabel", label: "Project mission label", children: getCopy(copy, "projects.missionLabel", "The mission") }) }),
            /* @__PURE__ */ jsxs9("div", { className: "grid gap-8 sm:grid-cols-2", children: [
              /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx15("p", { className: "brand-number mb-2", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.problem-label", copyKey: "projects.problemLabel", label: "Project problem label", children: getCopy(copy, "projects.problemLabel", "01 / Problem") }) }),
                /* @__PURE__ */ jsx15("p", { className: "text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.detail.${selectedProject.id}.problem`, copyKey: `projects.${projects.indexOf(selectedProject)}.problem`, label: "Project problem", children: selectedProject.problem }) })
              ] }),
              /* @__PURE__ */ jsxs9("div", { children: [
                /* @__PURE__ */ jsx15("p", { className: "brand-number mb-2", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.solution-label", copyKey: "projects.solutionLabel", label: "Project solution label", children: getCopy(copy, "projects.solutionLabel", "02 / Solution") }) }),
                /* @__PURE__ */ jsx15("p", { className: "text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: `projects.detail.${selectedProject.id}.solution`, copyKey: `projects.${projects.indexOf(selectedProject)}.solution`, label: "Project solution", children: selectedProject.solution }) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs9("div", { className: "mt-4 grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxs9("div", { className: "brand-card p-7", children: [
              /* @__PURE__ */ jsxs9("h4", { className: "flex items-center gap-2 text-lg font-black text-[#0f172a]", children: [
                /* @__PURE__ */ jsx15(Code24, { className: "h-5 w-5 text-[#15803d]" }),
                /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.technology-label", copyKey: "projects.technologyLabel", label: "Technology label", children: getCopy(copy, "projects.technologyLabel", "Technology") })
              ] }),
              /* @__PURE__ */ jsx15("div", { className: "mt-5 flex flex-wrap gap-2", children: selectedProject.technology.map((tech, i) => /* @__PURE__ */ jsx15("span", { className: "rounded-lg border border-[#16a34a]/20 bg-[#15803d]/5 px-3 py-1.5 text-xs font-bold text-[#475569]", children: tech }, i)) })
            ] }),
            /* @__PURE__ */ jsxs9("div", { className: "brand-card p-7", children: [
              /* @__PURE__ */ jsxs9("h4", { className: "flex items-center gap-2 text-lg font-black text-[#0f172a]", children: [
                /* @__PURE__ */ jsx15(Users, { className: "h-5 w-5 text-[#15803d]" }),
                /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.team-label", copyKey: "projects.teamLabel", label: "Project team label", children: getCopy(copy, "projects.teamLabel", "Team") })
              ] }),
              /* @__PURE__ */ jsx15("div", { className: "mt-5 flex flex-wrap gap-2", children: selectedProject.team.map((member, i) => /* @__PURE__ */ jsx15("span", { className: "rounded-lg border border-[#16a34a]/20 bg-[#15803d]/5 px-3 py-1.5 text-xs font-bold text-[#475569]", children: member }, i)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs9("aside", { className: "brand-card h-fit p-6 sm:p-7", children: [
          /* @__PURE__ */ jsxs9("div", { className: "mb-7 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx15("span", { className: "brand-number", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.links-label", copyKey: "projects.linksLabel", label: "Project links label", children: getCopy(copy, "projects.linksLabel", "Project / Links") }) }),
            /* @__PURE__ */ jsx15(ExternalLink, { className: "h-4 w-4 text-[#15803d]" })
          ] }),
          /* @__PURE__ */ jsxs9("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsx15(EditableRegion, { elementKey: `projects.detail.${selectedProject.id}.github`, copyKey: `projects.${projects.indexOf(selectedProject)}.github`, label: "Project repository link", className: "block", children: /* @__PURE__ */ jsxs9("a", { href: selectedProject.github || "#", target: selectedProject.github ? "_blank" : void 0, rel: "noreferrer", className: "flex w-full items-center justify-between rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4 text-sm font-bold text-[#334155] transition-colors hover:border-[#15803d]/40 hover:text-[#15803d]", children: [
              /* @__PURE__ */ jsxs9("span", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx15(Code24, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.repository-label", copyKey: "projects.repositoryLabel", label: "Repository label", children: getCopy(copy, "projects.repositoryLabel", "Repository") })
              ] }),
              /* @__PURE__ */ jsx15(ExternalLink, { className: "h-4 w-4" })
            ] }) }),
            /* @__PURE__ */ jsx15(EditableRegion, { elementKey: `projects.detail.${selectedProject.id}.demo`, copyKey: `projects.${projects.indexOf(selectedProject)}.demo`, label: "Project live demo link", className: "block", children: /* @__PURE__ */ jsxs9("a", { href: selectedProject.demo || "#", target: selectedProject.demo ? "_blank" : void 0, rel: "noreferrer", className: "flex w-full items-center justify-between rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4 text-sm font-bold text-[#334155] transition-colors hover:border-[#15803d]/40 hover:text-[#15803d]", children: [
              /* @__PURE__ */ jsxs9("span", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx15(Globe, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.demo-label", copyKey: "projects.demoLabel", label: "Live demo label", children: getCopy(copy, "projects.demoLabel", "Live demo") })
              ] }),
              /* @__PURE__ */ jsx15(ExternalLink, { className: "h-4 w-4" })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs9("div", { className: "mt-10 border-t border-[#16a34a]/20 pt-7", children: [
            /* @__PURE__ */ jsx15("p", { className: "text-xs leading-6 text-[#475569]", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.contribute", copyKey: "projects.contribute", label: "Project contribution prompt", children: getCopy(copy, "projects.contribute", "") }) }),
            /* @__PURE__ */ jsx15("button", { type: "button", className: "brand-button mt-5 w-full", children: /* @__PURE__ */ jsx15(EditableText, { elementKey: "projects.join-cta", copyKey: "projects.joinCta", label: "Project join button", children: getCopy(copy, "projects.joinCta", "Join this project") }) })
          ] })
        ] })
      ] })
    ] }, "details") }) })
  ] }) });
};

// src/components/Competitions.tsx
import { Lock, Timer, Trophy as Trophy2, Users as Users2 } from "lucide-react";
import { jsx as jsx16, jsxs as jsxs10 } from "react/jsx-runtime";
var Competitions = ({ active, copy }) => {
  return /* @__PURE__ */ jsx16(EditableRegion, { elementKey: "challenges.section", label: "Challenges section", collection: "challenges", children: /* @__PURE__ */ jsxs10("section", { id: "challenges", className: "brand-section brand-section--alt brand-grid-fine relative overflow-hidden py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx16(PharmacyBackground, { layout: "clinic" }),
    /* @__PURE__ */ jsx16("div", { className: "brand-glow left-[-15rem] top-20 opacity-50" }),
    /* @__PURE__ */ jsxs10("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
      /* @__PURE__ */ jsxs10("div", { className: "mb-14 flex flex-col items-center text-center", children: [
        /* @__PURE__ */ jsxs10("div", { className: "brand-eyebrow mb-6", children: [
          /* @__PURE__ */ jsx16(Trophy2, { className: "h-3.5 w-3.5" }),
          /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.eyebrow", copyKey: "challenges.eyebrow", label: "Challenges eyebrow", children: getCopy(copy, "challenges.eyebrow", "Decoder challenge") })
        ] }),
        /* @__PURE__ */ jsxs10("h2", { className: "brand-title max-w-4xl text-4xl sm:text-5xl lg:text-6xl", children: [
          /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.title", copyKey: "challenges.title", label: "Challenges heading", children: getCopy(copy, "challenges.title", "Can you decode") }),
          /* @__PURE__ */ jsx16("br", {}),
          /* @__PURE__ */ jsx16("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.title-accent", copyKey: "challenges.titleAccent", label: "Challenges heading accent", children: getCopy(copy, "challenges.titleAccent", "what others can't see?") }) })
        ] }),
        /* @__PURE__ */ jsx16("p", { className: "brand-copy mt-6 max-w-2xl text-base", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.description", copyKey: "challenges.description", label: "Challenges description", children: getCopy(copy, "challenges.description", "") }) }),
        /* @__PURE__ */ jsx16("div", { className: "mt-6", children: /* @__PURE__ */ jsx16(SectionLink, { id: "challenges" }) })
      ] }),
      /* @__PURE__ */ jsxs10(EditableRegion, { elementKey: "challenges.active-card", label: "Active challenge card", collection: "challenges", className: "brand-card relative mx-auto max-w-5xl overflow-hidden p-7 sm:p-10 lg:p-14", children: [
        /* @__PURE__ */ jsx16(Lock, { className: "absolute -right-8 -top-8 h-64 w-64 text-[#15803d]/5" }),
        /* @__PURE__ */ jsxs10("div", { className: "relative z-10", children: [
          /* @__PURE__ */ jsxs10("div", { className: "flex flex-col justify-between gap-7 border-b border-[#16a34a]/20 pb-8 sm:flex-row sm:items-start", children: [
            /* @__PURE__ */ jsxs10("div", { children: [
              /* @__PURE__ */ jsx16("p", { className: "brand-number mb-3", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.active-label", copyKey: "challenges.activeLabel", label: "Active challenge label", children: getCopy(copy, "challenges.activeLabel", "Active / CRX-DECODER") }) }),
              /* @__PURE__ */ jsx16("h3", { className: "text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.id", copyKey: "challenges.active.id", label: "Challenge ID", children: active.id }) }),
              /* @__PURE__ */ jsxs10("div", { className: "mt-4 flex flex-wrap items-center gap-4 text-[0.66rem] font-black uppercase tracking-[0.15em] text-[#475569]", children: [
                /* @__PURE__ */ jsx16("span", { className: "rounded-full border border-[#16a34a]/20 bg-[#15803d]/8 px-3 py-1.5 text-[#15803d]", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.difficulty", copyKey: "challenges.active.difficulty", label: "Challenge difficulty", children: active.difficulty }) }),
                /* @__PURE__ */ jsxs10("span", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx16(Users2, { className: "h-3.5 w-3.5 text-[#15803d]" }),
                  /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.participants", copyKey: "challenges.active.participants", label: "Challenge participants", children: active.participants }),
                  " ",
                  /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.participants-label", copyKey: "challenges.participantsLabel", label: "Participants label", children: getCopy(copy, "challenges.participantsLabel", "participants") })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs10("div", { className: "rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4 sm:min-w-[170px]", children: [
              /* @__PURE__ */ jsxs10("div", { className: "flex items-center gap-2 text-[#15803d]", children: [
                /* @__PURE__ */ jsx16(Timer, { className: "h-4 w-4" }),
                /* @__PURE__ */ jsx16("span", { className: "brand-mono text-xl font-black", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.time", copyKey: "challenges.active.timeRemaining", label: "Challenge time remaining", children: active.timeRemaining }) })
              ] }),
              /* @__PURE__ */ jsx16("p", { className: "mt-2 text-[0.64rem] font-black uppercase tracking-[0.15em] text-[#64748b]", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.time-label", copyKey: "challenges.timeLabel", label: "Time remaining label", children: getCopy(copy, "challenges.timeLabel", "Time remaining") }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs10("div", { className: "grid gap-10 pt-9 lg:grid-cols-[1fr_260px] lg:items-center", children: [
            /* @__PURE__ */ jsxs10("div", { children: [
              /* @__PURE__ */ jsx16("p", { className: "text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.problem", copyKey: "challenges.active.problem", label: "Challenge brief", children: active.problem }) }),
              /* @__PURE__ */ jsxs10("div", { className: "mt-8 flex flex-wrap gap-8", children: [
                /* @__PURE__ */ jsxs10("div", { children: [
                  /* @__PURE__ */ jsx16("p", { className: "brand-number", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.prize-label", copyKey: "challenges.prizeLabel", label: "Prize label", children: getCopy(copy, "challenges.prizeLabel", "Prize") }) }),
                  /* @__PURE__ */ jsx16("p", { className: "mt-2 text-2xl font-black text-[#15803d]", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.prize", copyKey: "challenges.active.prize", label: "Challenge prize", children: active.prize }) })
                ] }),
                /* @__PURE__ */ jsx16("div", { className: "h-12 w-px bg-[#15803d]/15" }),
                /* @__PURE__ */ jsxs10("div", { children: [
                  /* @__PURE__ */ jsx16("p", { className: "brand-number", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.reward-label", copyKey: "challenges.rewardLabel", label: "Reward label", children: getCopy(copy, "challenges.rewardLabel", "Reward") }) }),
                  /* @__PURE__ */ jsx16("p", { className: "mt-2 text-2xl font-black text-[#0f172a]", children: /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.reward", copyKey: "challenges.active.reward", label: "Challenge reward", children: active.reward }) })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs10("button", { type: "button", className: "brand-button w-full !rounded-xl !py-6", children: [
              /* @__PURE__ */ jsx16(EditableText, { elementKey: "challenges.cta", copyKey: "challenges.cta", label: "Challenge button", children: getCopy(copy, "challenges.cta", "Enter challenge") }),
              " ",
              /* @__PURE__ */ jsx16("span", { children: "\u2192" })
            ] })
          ] })
        ] })
      ] })
    ] })
  ] }) });
};

// src/components/Leadership.tsx
import { UsersRound } from "lucide-react";
import { jsx as jsx17, jsxs as jsxs11 } from "react/jsx-runtime";
var Leadership = ({ team, copy, media }) => {
  return /* @__PURE__ */ jsx17(EditableRegion, { elementKey: "leadership.section", label: "Leadership section", collection: "team", children: /* @__PURE__ */ jsxs11("section", { id: "leadership", className: "brand-section brand-section--alt py-28 sm:py-36", children: [
    /* @__PURE__ */ jsx17(PharmacyBackground, { layout: "clinic" }),
    /* @__PURE__ */ jsxs11("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
      /* @__PURE__ */ jsxs11("div", { className: "mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end", children: [
        /* @__PURE__ */ jsxs11("div", { children: [
          /* @__PURE__ */ jsxs11("div", { className: "brand-eyebrow mb-5", children: [
            /* @__PURE__ */ jsx17(UsersRound, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx17(EditableText, { elementKey: "leadership.eyebrow", copyKey: "leadership.eyebrow", label: "Leadership eyebrow", children: getCopy(copy, "leadership.eyebrow", "The people behind the signal") })
          ] }),
          /* @__PURE__ */ jsxs11("h2", { className: "brand-title text-4xl sm:text-5xl lg:text-6xl", children: [
            /* @__PURE__ */ jsx17(EditableText, { elementKey: "leadership.title", copyKey: "leadership.title", label: "Leadership heading", children: getCopy(copy, "leadership.title", "Clinical minds.") }),
            /* @__PURE__ */ jsx17("br", {}),
            /* @__PURE__ */ jsx17("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx17(EditableText, { elementKey: "leadership.title-accent", copyKey: "leadership.titleAccent", label: "Leadership heading accent", children: getCopy(copy, "leadership.titleAccent", "Technical hands.") }) })
          ] }),
          /* @__PURE__ */ jsx17("p", { className: "brand-copy mt-6 max-w-2xl text-base", children: /* @__PURE__ */ jsx17(EditableText, { elementKey: "leadership.description", copyKey: "leadership.description", label: "Leadership description", children: getCopy(copy, "leadership.description", "") }) })
        ] }),
        /* @__PURE__ */ jsx17(SectionLink, { id: "leadership" })
      ] }),
      /* @__PURE__ */ jsx17(EditableRegion, { elementKey: "leadership.grid", label: "Leadership team grid", collection: "team", className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: team.map((leader, index) => {
        const image = getMedia(media, `about.team.${index}.image`, { src: leader.image, alt: leader.name });
        return /* @__PURE__ */ jsxs11(EditableRegion, { elementKey: `leadership.member.${index}`, label: `${leader.name} team member`, collection: "team", className: "group", children: [
          /* @__PURE__ */ jsxs11("div", { className: "brand-card relative aspect-square overflow-hidden rounded-2xl p-2 transition-colors duration-300 group-hover:border-[#b8ff3d]/50", children: [
            /* @__PURE__ */ jsx17("div", { className: "absolute inset-2 z-10 rounded-xl border border-[#16a34a]/20" }),
            /* @__PURE__ */ jsx17(EditableImage, { elementKey: `leadership.member.${index}.image`, mediaKey: `about.team.${index}.image`, label: `${leader.name} photo`, src: image.src, alt: image.alt || leader.name, className: "h-full w-full rounded-xl object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0" }),
            /* @__PURE__ */ jsx17("div", { className: "absolute inset-x-2 bottom-2 z-20 bg-gradient-to-t from-[#020604] to-transparent px-4 pb-4 pt-12", children: /* @__PURE__ */ jsxs11("span", { className: "brand-number brand-number--lime", children: [
              "0",
              index + 1,
              " / TEAM"
            ] }) })
          ] }),
          /* @__PURE__ */ jsx17("h3", { className: "mt-5 text-base font-black text-[#0f172a] sm:text-lg", children: /* @__PURE__ */ jsx17(EditableText, { elementKey: `leadership.member.${index}.name`, copyKey: `about.team.${index}.name`, label: `${leader.name} name`, children: leader.name }) }),
          /* @__PURE__ */ jsx17("p", { className: "mt-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#15803d]", children: /* @__PURE__ */ jsx17(EditableText, { elementKey: `leadership.member.${index}.role`, copyKey: `about.team.${index}.role`, label: `${leader.name} role`, children: leader.role }) })
        ] }, `${leader.name}-${index}`);
      }) })
    ] })
  ] }) });
};

// src/components/Extras.tsx
import { ArrowUpRight as ArrowUpRight3, Briefcase, GraduationCap, Handshake, Rocket } from "lucide-react";
import { jsx as jsx18, jsxs as jsxs12 } from "react/jsx-runtime";
var OPPORTUNITY_ICONS = {
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  rocket: Rocket
};
var Extras = ({ content, copy }) => {
  return /* @__PURE__ */ jsx18(EditableRegion, { elementKey: "extras.section", label: "Partnerships and opportunities section", collection: "extras", children: /* @__PURE__ */ jsxs12("section", { id: "extras", className: "brand-section brand-grid-fine py-24 sm:py-28", children: [
    /* @__PURE__ */ jsx18(PharmacyBackground, { layout: "lab" }),
    /* @__PURE__ */ jsxs12("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
      /* @__PURE__ */ jsxs12("div", { className: "mb-12 flex items-end justify-between gap-4", children: [
        /* @__PURE__ */ jsxs12("div", { children: [
          /* @__PURE__ */ jsx18("div", { className: "brand-eyebrow", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.eyebrow", copyKey: "extras.eyebrow", label: "Extras eyebrow", children: getCopy(copy, "extras.eyebrow", "Connect & grow") }) }),
          /* @__PURE__ */ jsxs12("h2", { className: "brand-title mt-5 text-3xl sm:text-4xl", children: [
            /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.title", copyKey: "extras.title", label: "Extras heading", children: getCopy(copy, "extras.title", "More ways to") }),
            /* @__PURE__ */ jsx18("br", {}),
            /* @__PURE__ */ jsx18("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.title-accent", copyKey: "extras.titleAccent", label: "Extras heading accent", children: getCopy(copy, "extras.titleAccent", "plug in.") }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx18(SectionLink, { id: "extras" })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "grid gap-4 lg:grid-cols-2", children: [
        /* @__PURE__ */ jsxs12(EditableRegion, { elementKey: "extras.partnerships-card", label: "Partnerships card", collection: "partnerships", className: "brand-card p-7 sm:p-9", children: [
          /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-3 text-[#15803d]", children: [
            /* @__PURE__ */ jsx18(Handshake, { className: "h-5 w-5" }),
            /* @__PURE__ */ jsx18("span", { className: "brand-number", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.partnerships-label", copyKey: "extras.partnershipsLabel", label: "Partnerships label", children: getCopy(copy, "extras.partnershipsLabel", "Partnerships") }) })
          ] }),
          /* @__PURE__ */ jsx18("p", { className: "mt-6 max-w-xl text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.partnerships-description", copyKey: "extras.partnershipsDescription", label: "Partnerships description", children: getCopy(copy, "extras.partnershipsDescription", "") }) }),
          /* @__PURE__ */ jsx18("div", { className: "mt-7 grid grid-cols-2 gap-2", children: content.partnerships.map((partner, index) => /* @__PURE__ */ jsx18("div", { className: "rounded-lg border border-[#16a34a]/20 bg-[#15803d]/5 px-3 py-4 text-center text-[0.66rem] font-bold uppercase tracking-wide text-[#475569]", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: `extras.partner.${index}`, copyKey: `extras.partnerships.${index}`, label: `Partnership ${index + 1}`, children: partner }) }, `${partner}-${index}`)) }),
          /* @__PURE__ */ jsxs12("button", { type: "button", className: "brand-button brand-button--ghost mt-7 w-full", children: [
            /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.partnership-cta", copyKey: "extras.partnershipCta", label: "Partnership button", children: getCopy(copy, "extras.partnershipCta", "Partner with us") }),
            /* @__PURE__ */ jsx18(ArrowUpRight3, { className: "h-4 w-4" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs12(EditableRegion, { elementKey: "extras.opportunities-card", label: "Opportunities card", collection: "opportunities", className: "brand-card p-7 sm:p-9", children: [
          /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-3 text-[#15803d]", children: [
            /* @__PURE__ */ jsx18(Briefcase, { className: "h-5 w-5" }),
            /* @__PURE__ */ jsx18("span", { className: "brand-number", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: "extras.opportunities-label", copyKey: "extras.opportunitiesLabel", label: "Opportunities label", children: getCopy(copy, "extras.opportunitiesLabel", "Opportunities") }) })
          ] }),
          /* @__PURE__ */ jsx18("div", { className: "mt-6 space-y-3", children: content.opportunities.map((opportunity, index) => {
            const Icon = OPPORTUNITY_ICONS[opportunity.icon] || Briefcase;
            return /* @__PURE__ */ jsxs12(EditableRegion, { elementKey: `extras.opportunity.${opportunity.id || index}`, label: `${opportunity.title} opportunity`, collection: "opportunities", className: "group flex items-center gap-4 rounded-xl border border-[#16a34a]/20 bg-[#15803d]/5 p-4 transition-colors hover:border-[#15803d]/40", children: [
              /* @__PURE__ */ jsx18("span", { className: "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d]", children: /* @__PURE__ */ jsx18(Icon, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsxs12("span", { className: "min-w-0", children: [
                /* @__PURE__ */ jsx18("span", { className: "block truncate text-sm font-bold text-[#0f172a]", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: `extras.opportunity.${opportunity.id || index}.title`, copyKey: `extras.opportunities.${index}.title`, label: `${opportunity.title} title`, children: opportunity.title }) }),
                /* @__PURE__ */ jsx18("span", { className: "mt-1 block text-[0.64rem] font-black uppercase tracking-[0.15em] text-[#64748b]", children: /* @__PURE__ */ jsx18(EditableText, { elementKey: `extras.opportunity.${opportunity.id || index}.organization`, copyKey: `extras.opportunities.${index}.organization`, label: `${opportunity.title} organization`, children: opportunity.organization }) })
              ] }),
              /* @__PURE__ */ jsx18(ArrowUpRight3, { className: "ml-auto h-4 w-4 shrink-0 text-[#64748b] transition-colors group-hover:text-[#15803d]" })
            ] }, opportunity.id || index);
          }) })
        ] })
      ] })
    ] })
  ] }) });
};

// src/components/Terms.tsx
import { FileText } from "lucide-react";
import { jsx as jsx19, jsxs as jsxs13 } from "react/jsx-runtime";
var Terms = ({ content, copy }) => {
  return /* @__PURE__ */ jsx19(EditableRegion, { elementKey: "terms.section", label: "Terms section", collection: "terms", children: /* @__PURE__ */ jsxs13("section", { id: "terms", className: "brand-section brand-grid-fine min-h-screen py-28 text-[#475569] sm:py-36", children: [
    /* @__PURE__ */ jsx19(PharmacyBackground, { layout: "clinic" }),
    /* @__PURE__ */ jsx19("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: /* @__PURE__ */ jsxs13(motion.div, { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, children: [
      /* @__PURE__ */ jsxs13("div", { className: "mb-16 flex flex-col justify-between gap-6 sm:flex-row sm:items-end", children: [
        /* @__PURE__ */ jsxs13("div", { children: [
          /* @__PURE__ */ jsxs13("div", { className: "brand-eyebrow mb-5", children: [
            /* @__PURE__ */ jsx19(FileText, { className: "h-3.5 w-3.5" }),
            /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.eyebrow", copyKey: "terms.eyebrow", label: "Terms eyebrow", children: getCopy(copy, "terms.eyebrow", "Legal / society terms") })
          ] }),
          /* @__PURE__ */ jsxs13("h1", { className: "brand-title text-4xl sm:text-5xl lg:text-6xl", children: [
            /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.title", copyKey: "terms.title", label: "Terms title", children: getCopy(copy, "terms.title", "Terms") }),
            " ",
            /* @__PURE__ */ jsx19("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.title-accent", copyKey: "terms.titleAccent", label: "Terms title accent", children: getCopy(copy, "terms.titleAccent", "&") }) }),
            /* @__PURE__ */ jsx19("br", {}),
            /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.title-after", copyKey: "terms.titleAfter", label: "Terms title ending", children: getCopy(copy, "terms.titleAfter", "Conditions") })
          ] }),
          /* @__PURE__ */ jsx19("p", { className: "mt-6 text-sm uppercase tracking-[0.14em] text-[#64748b]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.tagline", copyKey: "terms.tagline", label: "Terms tagline", children: getCopy(copy, "terms.tagline", "Coding the future of pharmacy") }) })
        ] }),
        /* @__PURE__ */ jsx19(SectionLink, { id: "terms" })
      ] }),
      /* @__PURE__ */ jsx19(EditableRegion, { elementKey: "terms.metadata", label: "Terms metadata cards", className: "mb-10 grid gap-3 sm:grid-cols-3", children: [[getCopy(copy, "terms.versionLabel", "Version"), content.version, "version"], [getCopy(copy, "terms.effectiveDateLabel", "Effective date"), getCopy(copy, "terms.effectiveDate", "22/03/2026"), "effectiveDate"], [getCopy(copy, "terms.lastUpdatedLabel", "Last updated"), content.lastUpdated, "lastUpdated"]].map(([label, value, id3]) => /* @__PURE__ */ jsxs13("div", { className: "brand-card p-5", children: [
        /* @__PURE__ */ jsx19("p", { className: "brand-number", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: `terms.meta.${id3}.label`, copyKey: `terms.${id3 === "effectiveDate" ? "effectiveDateLabel" : id3 === "lastUpdated" ? "lastUpdatedLabel" : "versionLabel"}`, label: `${label} label`, children: label }) }),
        /* @__PURE__ */ jsx19("p", { className: "mt-2 text-sm font-bold text-[#0f172a]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: `terms.meta.${id3}.value`, copyKey: id3 === "version" ? "terms.version" : id3 === "lastUpdated" ? "terms.lastUpdated" : "terms.effectiveDate", label: `${label} value`, children: value }) })
      ] }, id3)) }),
      /* @__PURE__ */ jsx19(EditableRegion, { elementKey: "terms.cards", label: "Terms cards", collection: "terms", className: "grid items-start gap-4 md:grid-cols-2", children: content.sections.map((section, index) => /* @__PURE__ */ jsx19(motion.article, { initial: { opacity: 0, y: 15 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, className: "brand-card brand-card-hover p-6 sm:p-8", children: /* @__PURE__ */ jsxs13(EditableRegion, { elementKey: `terms.card.${section.id}`, label: `${section.title} terms card`, collection: "terms", children: [
        /* @__PURE__ */ jsxs13("div", { className: "mb-6 flex items-start gap-4 border-b border-[#16a34a]/20 pb-5", children: [
          /* @__PURE__ */ jsx19("span", { className: "brand-number text-lg", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: `terms.card.${section.id}.id`, copyKey: `terms.sections.${index}.id`, label: `Terms section ${index + 1} ID`, children: section.id }) }),
          /* @__PURE__ */ jsx19("h2", { className: "text-base font-black leading-snug text-[#0f172a]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: `terms.card.${section.id}.title`, copyKey: `terms.sections.${index}.title`, label: `${section.title} title`, children: section.title }) })
        ] }),
        /* @__PURE__ */ jsx19("div", { className: "whitespace-pre-line text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: `terms.card.${section.id}.content`, copyKey: `terms.sections.${index}.content`, label: `${section.title} content`, children: /* @__PURE__ */ jsx19(SiteEmojiText, { text: section.content }) }) })
      ] }) }, section.id)) }),
      /* @__PURE__ */ jsxs13(EditableRegion, { elementKey: "terms.acceptance", label: "Terms acceptance panel", className: "relative mt-16 overflow-hidden rounded-2xl border border-[#15803d]/30 bg-[#f1f5f9] p-8 text-center sm:p-12", children: [
        /* @__PURE__ */ jsx19("div", { className: "brand-glow left-1/2 top-[-14rem] -translate-x-1/2 opacity-40" }),
        /* @__PURE__ */ jsxs13("div", { className: "relative z-10", children: [
          /* @__PURE__ */ jsx19("p", { className: "brand-eyebrow justify-center", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.acceptance-eyebrow", copyKey: "terms.acceptanceEyebrow", label: "Terms acceptance eyebrow", children: getCopy(copy, "terms.acceptanceEyebrow", "Official acceptance") }) }),
          /* @__PURE__ */ jsx19("h3", { className: "mt-5 text-2xl font-black text-[#0f172a] sm:text-3xl", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.acceptance-title", copyKey: "terms.acceptanceTitle", label: "Terms acceptance heading", children: getCopy(copy, "terms.acceptanceTitle", "") }) }),
          /* @__PURE__ */ jsx19("p", { className: "mx-auto mt-5 max-w-2xl text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.acceptance-description", copyKey: "terms.acceptanceDescription", label: "Terms acceptance description", children: getCopy(copy, "terms.acceptanceDescription", "") }) }),
          /* @__PURE__ */ jsx19("p", { className: "mt-7 text-sm font-black uppercase tracking-[0.12em] text-[#15803d]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.acceptance-motto", copyKey: "terms.acceptanceMotto", label: "Terms acceptance motto", children: getCopy(copy, "terms.acceptanceMotto", "") }) }),
          /* @__PURE__ */ jsx19("p", { className: "mt-9 text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#64748b]", children: /* @__PURE__ */ jsx19(EditableText, { elementKey: "terms.acceptance-copyright", copyKey: "terms.acceptanceCopyright", label: "Terms acceptance copyright", children: getCopy(copy, "terms.acceptanceCopyright", "") }) })
        ] })
      ] })
    ] }) })
  ] }) });
};

// src/components/Footer.tsx
import { ArrowUpRight as ArrowUpRight4, Check, Globe as Globe2, Mail as Mail2, Phone, Send as Send2, X as X2 } from "lucide-react";
import { useEffect as useEffect5, useState as useState4 } from "react";

// src/components/ContactForm.tsx
import { useState as useState3 } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2 as CheckCircle22,
  Handshake as Handshake2,
  Mail,
  MessageCircle,
  Send,
  Sparkles as Sparkles2,
  User,
  X
} from "lucide-react";
import { Fragment as Fragment7, jsx as jsx20, jsxs as jsxs14 } from "react/jsx-runtime";
var TOPICS = [
  { label: "JOIN Code Rx", subject: "Question about joining Code Rx", icon: Sparkles2 },
  { label: "Project or research", subject: "Project or research enquiry", icon: MessageCircle },
  { label: "Partnership", subject: "Partnership opportunity", icon: Handshake2 }
];
var emptyForm = () => ({ name: "", email: "", subject: "", message: "" });
var ContactForm = ({ isOpen, onClose, supportEmail = "coderxsociety@gmail.com" }) => {
  const [formData, setFormData] = useState3(emptyForm);
  const [status, setStatus] = useState3("idle");
  const close = () => {
    setStatus("idle");
    onClose();
  };
  const chooseTopic = (topic) => {
    setFormData((current) => ({ ...current, subject: topic.subject }));
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      await db.contacts.create(formData);
      setStatus("sent");
    } catch (error) {
      console.error("Failed to send message:", error);
      setStatus("error");
    }
  };
  const startAnotherMessage = () => {
    setFormData(emptyForm());
    setStatus("idle");
  };
  const fieldLabel = "mb-1.5 block text-[12px] font-black uppercase tracking-[0.12em] text-[#334155]";
  const fieldBox = "w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-[15px] font-medium text-[#0f172a] outline-none transition placeholder:text-[#64748b] focus:border-[#15803d] focus:ring-4 focus:ring-[#16a34a]/15";
  const panel = /* @__PURE__ */ jsx20(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs14(
    "div",
    {
      className: "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#04120b]/75 p-3 sm:items-center sm:p-6",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "phantom-contact-title",
      children: [
        /* @__PURE__ */ jsx20(
          motion.button,
          {
            type: "button",
            "aria-label": "Close Talk to PHANTOM",
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            onClick: close,
            className: "fixed inset-0 cursor-default"
          }
        ),
        /* @__PURE__ */ jsxs14(
          motion.section,
          {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: 12 },
            transition: { type: "spring", duration: 0.4, bounce: 0.12 },
            className: "relative my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-[0_28px_90px_rgba(2,20,12,0.45)]",
            children: [
              /* @__PURE__ */ jsx20("header", { className: "relative bg-[#063b2a] px-6 py-5 sm:px-8 sm:py-6", children: /* @__PURE__ */ jsxs14("div", { className: "flex items-start justify-between gap-4", children: [
                /* @__PURE__ */ jsxs14("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx20("p", { className: "text-[11px] font-black uppercase tracking-[0.18em] text-[#b8ff3d]", children: "Code Rx Society" }),
                  /* @__PURE__ */ jsxs14("h2", { id: "phantom-contact-title", className: "mt-2 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl", children: [
                    "Talk to ",
                    /* @__PURE__ */ jsx20("span", { className: "text-[#b8ff3d]", children: "PHANTOM." })
                  ] }),
                  /* @__PURE__ */ jsx20("p", { className: "mt-2 max-w-xl text-[13px] font-medium leading-6 text-[#dcefe2] sm:text-sm", children: "Joining, research, partnerships or a project \u2014 send one clear message and the Code Rx leadership team routes it to the right next step. Replies normally arrive within 24\u201348 hours." })
                ] }),
                /* @__PURE__ */ jsx20(
                  "button",
                  {
                    type: "button",
                    onClick: close,
                    "aria-label": "Close Talk to PHANTOM",
                    className: "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#b8ff3d]/40",
                    children: /* @__PURE__ */ jsx20(X, { className: "h-5 w-5" })
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx20("div", { className: "px-6 py-6 sm:px-8 sm:py-7", children: status === "sent" ? /* @__PURE__ */ jsxs14("div", { className: "flex flex-col items-center py-4 text-center", children: [
                /* @__PURE__ */ jsx20("div", { className: "grid h-16 w-16 place-items-center rounded-2xl bg-[#ecfdf5] text-[#15803d]", children: /* @__PURE__ */ jsx20(CheckCircle22, { className: "h-8 w-8" }) }),
                /* @__PURE__ */ jsx20("p", { className: "mt-6 text-[11px] font-black uppercase tracking-[0.18em] text-[#15803d]", children: "Message received" }),
                /* @__PURE__ */ jsx20("h3", { className: "mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f172a] sm:text-3xl", children: "Your message is in." }),
                /* @__PURE__ */ jsxs14("p", { className: "mt-3 max-w-md text-sm leading-7 text-[#475569]", children: [
                  "We will reply to ",
                  /* @__PURE__ */ jsx20("strong", { className: "text-[#0f172a]", children: formData.email }),
                  ". Thank you for reaching out to Code Rx Society."
                ] }),
                /* @__PURE__ */ jsxs14("div", { className: "mt-7 flex flex-col gap-3 sm:flex-row", children: [
                  /* @__PURE__ */ jsx20("button", { type: "button", onClick: startAnotherMessage, className: "rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#15803d] transition hover:bg-[#d1fae5]", children: "Send another message" }),
                  /* @__PURE__ */ jsx20("button", { type: "button", onClick: close, className: "rounded-xl bg-[#0f172a] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#1e293b]", children: "Close" })
                ] })
              ] }) : /* @__PURE__ */ jsxs14(Fragment7, { children: [
                /* @__PURE__ */ jsx20("p", { className: "text-[12px] font-black uppercase tracking-[0.14em] text-[#15803d]", children: "Talk to PHANTOM" }),
                /* @__PURE__ */ jsx20("h3", { className: "mt-1.5 text-2xl font-black tracking-[-0.03em] text-[#0f172a]", children: "How can we help?" }),
                /* @__PURE__ */ jsx20("p", { className: "mt-2 text-sm leading-6 text-[#475569]", children: "Choose a starting point, then tell us what you need. Your email is used only to reply to this message." }),
                /* @__PURE__ */ jsx20("div", { className: "mt-5 grid gap-2 sm:grid-cols-3", children: TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  const selected = formData.subject === topic.subject;
                  return /* @__PURE__ */ jsxs14(
                    "button",
                    {
                      type: "button",
                      onClick: () => chooseTopic(topic),
                      "aria-pressed": selected,
                      className: `flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-[12px] font-black uppercase tracking-[0.06em] transition ${selected ? "border-[#15803d] bg-[#ecfdf5] text-[#14532d]" : "border-[#cbd5e1] bg-white text-[#334155] hover:border-[#15803d] hover:bg-[#f0fdf4]"}`,
                      children: [
                        /* @__PURE__ */ jsx20(Icon, { className: `h-4 w-4 shrink-0 ${selected ? "text-[#15803d]" : "text-[#64748b]"}` }),
                        topic.label
                      ]
                    },
                    topic.label
                  );
                }) }),
                /* @__PURE__ */ jsxs14("form", { onSubmit: handleSubmit, className: "mt-5 space-y-4", children: [
                  /* @__PURE__ */ jsxs14("div", { className: "grid gap-4 sm:grid-cols-2", children: [
                    /* @__PURE__ */ jsxs14("label", { className: "block", children: [
                      /* @__PURE__ */ jsx20("span", { className: fieldLabel, children: "Your name" }),
                      /* @__PURE__ */ jsxs14("div", { className: "relative", children: [
                        /* @__PURE__ */ jsx20(User, { className: "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" }),
                        /* @__PURE__ */ jsx20(
                          "input",
                          {
                            type: "text",
                            autoComplete: "name",
                            placeholder: "Your full name",
                            value: formData.name,
                            onChange: (event) => setFormData((current) => ({ ...current, name: event.target.value })),
                            className: `${fieldBox} pl-11`,
                            required: true
                          }
                        )
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs14("label", { className: "block", children: [
                      /* @__PURE__ */ jsx20("span", { className: fieldLabel, children: "Reply email" }),
                      /* @__PURE__ */ jsxs14("div", { className: "relative", children: [
                        /* @__PURE__ */ jsx20(Mail, { className: "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" }),
                        /* @__PURE__ */ jsx20(
                          "input",
                          {
                            type: "email",
                            autoComplete: "email",
                            placeholder: "you@example.com",
                            value: formData.email,
                            onChange: (event) => setFormData((current) => ({ ...current, email: event.target.value })),
                            className: `${fieldBox} pl-11`,
                            required: true
                          }
                        )
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs14("label", { className: "block", children: [
                    /* @__PURE__ */ jsx20("span", { className: fieldLabel, children: "Subject" }),
                    /* @__PURE__ */ jsx20(
                      "input",
                      {
                        type: "text",
                        placeholder: "What would you like to discuss?",
                        value: formData.subject,
                        onChange: (event) => setFormData((current) => ({ ...current, subject: event.target.value })),
                        className: fieldBox,
                        required: true
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs14("label", { className: "block", children: [
                    /* @__PURE__ */ jsx20("span", { className: fieldLabel, children: "Your message" }),
                    /* @__PURE__ */ jsx20(
                      "textarea",
                      {
                        placeholder: "Share the details PHANTOM should know\u2026",
                        rows: 5,
                        value: formData.message,
                        onChange: (event) => setFormData((current) => ({ ...current, message: event.target.value })),
                        className: `${fieldBox} resize-y leading-6`,
                        required: true
                      }
                    )
                  ] }),
                  status === "error" && /* @__PURE__ */ jsx20("p", { role: "alert", className: "rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-sm font-semibold text-[#be123c]", children: "We could not send your message just now. Please check your connection and try again." }),
                  /* @__PURE__ */ jsxs14("div", { className: "flex flex-col gap-3 border-t border-[#e2e8f0] pt-4 sm:flex-row sm:items-center sm:justify-between", children: [
                    /* @__PURE__ */ jsx20("p", { className: "text-xs leading-5 text-[#475569]", children: "By sending, you agree that Code Rx may use your email only to respond to this enquiry." }),
                    /* @__PURE__ */ jsxs14(
                      "button",
                      {
                        type: "submit",
                        disabled: status === "sending",
                        className: "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#15803d] px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#14652f] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#16a34a]/25 disabled:cursor-not-allowed disabled:opacity-60",
                        children: [
                          status === "sending" ? "Sending\u2026" : "Send to PHANTOM",
                          /* @__PURE__ */ jsx20(Send, { className: "h-4 w-4" })
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs14("p", { className: "text-center text-xs font-semibold text-[#475569] sm:text-left", children: [
                    "Prefer email?",
                    " ",
                    /* @__PURE__ */ jsx20("a", { href: `mailto:${supportEmail}`, className: "font-black text-[#15803d] underline-offset-2 hover:underline", children: supportEmail })
                  ] })
                ] })
              ] }) })
            ]
          }
        )
      ]
    }
  ) });
  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
};

// src/components/Footer.tsx
import { Fragment as Fragment8, jsx as jsx21, jsxs as jsxs15 } from "react/jsx-runtime";
var Footer = ({ copy, links, media }) => {
  const [isContactOpen, setIsContactOpen] = useState4(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState4(false);
  const [isCodeOpen, setIsCodeOpen] = useState4(false);
  const [subscribeEmail, setSubscribeEmail] = useState4("");
  const [subscribeStatus, setSubscribeStatus] = useState4("idle");
  const logo = getMedia(media, "footer.logo", { src: "/CODE%20RX11.png", alt: "Code Rx Society" });
  const telegram = getLink(links, "footer.telegram", "https://t.me/+EdRpfR1GTGNjM2Q0");
  const email = getLink(links, "footer.email", "coderxsociety@gmail.com");
  useEffect5(() => {
    const openFromHash = () => {
      if (window.location.hash === PHANTOM_CONTACT_HASH) setIsContactOpen(true);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  const handleSubscribe = async (event) => {
    event.preventDefault();
    setSubscribeStatus("submitting");
    try {
      await db.subscribers.create({ email: subscribeEmail });
      setSubscribeStatus("success");
      setSubscribeEmail("");
      window.setTimeout(() => setSubscribeStatus("idle"), 3e3);
    } catch (error) {
      console.error("Failed to subscribe:", error);
      setSubscribeStatus("idle");
      alert("Failed to subscribe. Please try again.");
    }
  };
  return /* @__PURE__ */ jsxs15(Fragment8, { children: [
    /* @__PURE__ */ jsxs15(EditableRegion, { as: "footer", elementKey: "footer.section", label: "Footer", collection: "footer", className: "brand-section brand-grid border-t border-[#16a34a]/20 pt-20 sm:pt-28", children: [
      /* @__PURE__ */ jsx21(PharmacyBackground, { layout: "lab" }),
      /* @__PURE__ */ jsx21("div", { className: "brand-scanlines absolute inset-0" }),
      /* @__PURE__ */ jsxs15("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 pb-8 sm:px-8 lg:px-10", children: [
        /* @__PURE__ */ jsxs15("div", { className: "grid gap-14 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1fr]", children: [
          /* @__PURE__ */ jsx21(EditableRegion, { elementKey: "footer.brand", label: "Footer brand and newsletter", children: /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsxs15("a", { href: "#home", className: "inline-flex items-center gap-3 no-underline", children: [
              /* @__PURE__ */ jsx21(EditableImage, { elementKey: "footer.logo", mediaKey: "footer.logo", label: "Footer logo", src: logo.src, alt: logo.alt, className: "brand-logo-plate h-14 w-14 object-contain p-0.5" }),
              /* @__PURE__ */ jsxs15("span", { children: [
                /* @__PURE__ */ jsxs15("span", { className: "block text-lg font-black tracking-[0.12em] text-[#0f172a]", children: [
                  /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.brand-before", copyKey: "nav.brand.before", label: "Footer brand", children: getCopy(copy, "nav.brand.before", "CODE") }),
                  " ",
                  /* @__PURE__ */ jsx21("span", { className: "text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.brand-accent", copyKey: "nav.brand.accent", label: "Footer brand accent", children: getCopy(copy, "nav.brand.accent", "Rx") }) })
                ] }),
                /* @__PURE__ */ jsx21("span", { className: "mt-1 block text-[0.66rem] font-black uppercase tracking-[0.26em] text-[#475569]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.brand-location", copyKey: "footer.brand.location", label: "Footer location", children: getCopy(copy, "footer.brand.location", "Society / Ghana") }) })
              ] })
            ] }),
            /* @__PURE__ */ jsx21("p", { className: "mt-7 max-w-sm text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.description", copyKey: "footer.description", label: "Footer description", children: getCopy(copy, "footer.description", "") }) }),
            /* @__PURE__ */ jsxs15("div", { className: "mt-7 flex items-center gap-4", children: [
              /* @__PURE__ */ jsx21("a", { href: telegram, target: "_blank", rel: "noopener noreferrer", "aria-label": "Join Telegram", className: "grid h-10 w-10 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d] transition-colors hover:bg-[#15803d]/10", children: /* @__PURE__ */ jsx21(Send2, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsx21("a", { href: "#community", "aria-label": "Community", className: "grid h-10 w-10 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d] transition-colors hover:bg-[#15803d]/10", children: /* @__PURE__ */ jsx21(Globe2, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsx21("button", { type: "button", onClick: () => setIsContactOpen(true), "aria-label": "Talk to PHANTOM", title: "Talk to PHANTOM", className: "grid h-10 w-10 place-items-center rounded-lg border border-[#16a34a]/20 text-[#15803d] transition-colors hover:bg-[#15803d]/10", children: /* @__PURE__ */ jsx21(Mail2, { className: "h-4 w-4" }) })
            ] }),
            /* @__PURE__ */ jsx21("div", { className: "mt-7 max-w-sm", children: /* @__PURE__ */ jsx21(ClientPortalEntry, { variant: "tile", label: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.client.label", copyKey: "footer.client.label", label: "Client project room label", children: getCopy(copy, "footer.client.label", "Client project room") }) }) }),
            /* @__PURE__ */ jsxs15("div", { className: "mt-8 max-w-sm border-t border-[#16a34a]/20 pt-6", children: [
              /* @__PURE__ */ jsx21("p", { className: "brand-number", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.newsletter-label", copyKey: "footer.newsletterLabel", label: "Newsletter label", children: getCopy(copy, "footer.newsletterLabel", "Signal / Newsletter") }) }),
              /* @__PURE__ */ jsx21("p", { className: "mt-2 text-sm text-[#475569]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.newsletter-description", copyKey: "footer.newsletterDescription", label: "Newsletter description", children: getCopy(copy, "footer.newsletterDescription", "") }) }),
              /* @__PURE__ */ jsxs15("form", { className: "mt-4 flex gap-2", onSubmit: handleSubscribe, children: [
                /* @__PURE__ */ jsx21("input", { type: "email", required: true, placeholder: getCopy(copy, "footer.emailPlaceholder", "Your email"), value: subscribeEmail, onChange: (event) => setSubscribeEmail(event.target.value), className: "brand-input px-3 py-2.5 text-xs" }),
                /* @__PURE__ */ jsx21("button", { type: "submit", disabled: subscribeStatus === "submitting", className: "brand-button brand-button--small shrink-0 disabled:opacity-50", children: subscribeStatus === "submitting" ? "..." : subscribeStatus === "success" ? /* @__PURE__ */ jsx21(Check, { className: "h-4 w-4" }) : /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.newsletter-cta", copyKey: "footer.newsletterCta", label: "Newsletter button", children: getCopy(copy, "footer.newsletterCta", "Join") }) })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx21(EditableRegion, { elementKey: "footer.explore", label: "Footer explore links", children: /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsx21("p", { className: "brand-number mb-6", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.explore-label", copyKey: "footer.exploreLabel", label: "Explore label", children: getCopy(copy, "footer.exploreLabel", "Explore") }) }),
            /* @__PURE__ */ jsx21("ul", { className: "space-y-3 text-sm text-[#475569]", children: [["about", "footer.explore.about", "About us"], ["learn", "footer.explore.learn", "Academy"], ["projects", "footer.explore.projects", "Project lab"], ["challenges", "footer.explore.challenges", "Challenges"], ["community", "footer.explore.community", "Community"]].map(([id3, key, fallback]) => /* @__PURE__ */ jsx21("li", { children: /* @__PURE__ */ jsx21("a", { href: `#${id3}`, className: "transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: `footer.explore.${id3}`, copyKey: key, label: `${fallback} footer link`, children: getCopy(copy, key, fallback) }) }) }, id3)) })
          ] }) }),
          /* @__PURE__ */ jsx21(EditableRegion, { elementKey: "footer.resources", label: "Footer resource links", children: /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsx21("p", { className: "brand-number mb-6", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.resources-label", copyKey: "footer.resourcesLabel", label: "Footer resources label", children: getCopy(copy, "footer.resourcesLabel", "Resources") }) }),
            /* @__PURE__ */ jsx21("ul", { className: "space-y-3 text-sm text-[#475569]", children: [["docs", "footer.resources.docs", "Documentation", "resources"], ["research", "footer.resources.research", "Research papers", "resources"], ["opensource", "footer.resources.opensource", "Open source", "resources"], ["terms", "footer.resources.terms", "Terms & conditions", "terms"]].map(([id3, key, fallback, href]) => /* @__PURE__ */ jsx21("li", { children: /* @__PURE__ */ jsx21("a", { href: `#${href}`, className: "transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: `footer.resources.${id3}`, copyKey: key, label: `${fallback} footer link`, children: getCopy(copy, key, fallback) }) }) }, id3)) })
          ] }) }),
          /* @__PURE__ */ jsx21(EditableRegion, { elementKey: "footer.contact", label: "Footer contact details", children: /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsx21("p", { className: "brand-number mb-6", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.contact-label", copyKey: "footer.contactLabel", label: "Contact label", children: getCopy(copy, "footer.contactLabel", "Contact") }) }),
            /* @__PURE__ */ jsxs15("div", { className: "space-y-4 text-sm text-[#475569]", children: [
              /* @__PURE__ */ jsxs15("a", { href: `mailto:${email}`, className: "flex items-center gap-3 transition-colors hover:text-[#15803d]", children: [
                /* @__PURE__ */ jsx21(Mail2, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.email", copyKey: "links.footer.email", label: "Contact email", children: email })
              ] }),
              /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx21(Phone, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.phone-one", copyKey: "links.footer.phoneOne", label: "Contact phone one", children: getLink(links, "footer.phoneOne", "053 734 5524") })
              ] }),
              /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx21(Phone, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.phone-two", copyKey: "links.footer.phoneTwo", label: "Contact phone two", children: getLink(links, "footer.phoneTwo", "050 773 0598") })
              ] }),
              /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx21(Globe2, { className: "h-4 w-4 text-[#15803d]" }),
                /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.country", copyKey: "links.footer.country", label: "Contact country", children: getLink(links, "footer.country", "Ghana") })
              ] })
            ] }),
            /* @__PURE__ */ jsxs15("button", { type: "button", onClick: () => setIsContactOpen(true), className: "group mt-7 flex w-full items-center gap-3 rounded-2xl border border-[#16a34a]/25 bg-emerald-50/80 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#16a34a]/50 hover:bg-emerald-100/70", children: [
              /* @__PURE__ */ jsx21("span", { className: "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#15803d] text-[#b8ff3d] shadow-[0_7px_16px_rgba(21,128,61,0.22)]", children: /* @__PURE__ */ jsx21(Mail2, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsxs15("span", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsx21("span", { className: "block text-xs font-black uppercase tracking-[0.12em] text-[#14532d]", children: "Talk to PHANTOM" }),
                /* @__PURE__ */ jsx21("span", { className: "mt-1 block text-xs leading-5 text-[#475569]", children: "Questions, partnerships & support" })
              ] }),
              /* @__PURE__ */ jsx21(ArrowUpRight4, { className: "h-4 w-4 text-[#15803d] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" })
            ] }),
            /* @__PURE__ */ jsxs15("a", { href: telegram, target: "_blank", rel: "noopener noreferrer", className: "brand-button brand-button--ghost mt-3 w-full", children: [
              /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.telegram-cta", copyKey: "footer.telegramCta", label: "Telegram button", children: getCopy(copy, "footer.telegramCta", "Join Telegram") }),
              /* @__PURE__ */ jsx21(ArrowUpRight4, { className: "h-4 w-4" })
            ] })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "mt-16 flex flex-col justify-between gap-4 border-t border-[#16a34a]/20 pt-6 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#475569] sm:flex-row", children: [
          /* @__PURE__ */ jsx21("p", { children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.copyright", copyKey: "footer.copyright", label: "Footer copyright", children: getCopy(copy, "footer.copyright", "") }) }),
          /* @__PURE__ */ jsxs15("div", { className: "flex flex-wrap gap-5", children: [
            /* @__PURE__ */ jsx21("button", { type: "button", onClick: () => setIsPrivacyOpen(true), className: "transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.privacy", copyKey: "footer.privacy", label: "Privacy link", children: getCopy(copy, "footer.privacy", "Privacy") }) }),
            /* @__PURE__ */ jsx21("button", { type: "button", onClick: () => setIsCodeOpen(true), className: "transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.conduct", copyKey: "footer.codeOfConduct", label: "Code of conduct link", children: getCopy(copy, "footer.codeOfConduct", "Code of conduct") }) }),
            /* @__PURE__ */ jsx21("a", { href: "#terms", className: "transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.terms", copyKey: "footer.terms", label: "Terms link", children: getCopy(copy, "footer.terms", "Terms") }) })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx21(ContactForm, { isOpen: isContactOpen, onClose: () => setIsContactOpen(false), supportEmail: email }),
    isPrivacyOpen && /* @__PURE__ */ jsx21(Modal, { title: getCopy(copy, "footer.privacyTitle", "Privacy policy"), onClose: () => setIsPrivacyOpen(false), children: /* @__PURE__ */ jsxs15(PolicyContent, { children: [
      /* @__PURE__ */ jsx21("p", { children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.privacy-body-one", copyKey: "footer.privacyBody1", label: "Privacy paragraph one", children: getCopy(copy, "footer.privacyBody1", "") }) }),
      /* @__PURE__ */ jsx21("p", { children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.privacy-body-two", copyKey: "footer.privacyBody2", label: "Privacy paragraph two", children: getCopy(copy, "footer.privacyBody2", "") }) }),
      /* @__PURE__ */ jsxs15("p", { children: [
        /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.privacy-body-three", copyKey: "footer.privacyBody3", label: "Privacy paragraph three", children: getCopy(copy, "footer.privacyBody3", "") }),
        " ",
        /* @__PURE__ */ jsx21("a", { className: "text-[#15803d]", href: `mailto:${email}`, children: email }),
        "."
      ] })
    ] }) }),
    isCodeOpen && /* @__PURE__ */ jsx21(Modal, { title: getCopy(copy, "footer.conductTitle", "Code of conduct"), onClose: () => setIsCodeOpen(false), children: /* @__PURE__ */ jsxs15(PolicyContent, { children: [
      /* @__PURE__ */ jsx21("p", { children: /* @__PURE__ */ jsx21(EditableText, { elementKey: "footer.conduct-intro", copyKey: "footer.conductIntro", label: "Code of conduct introduction", children: getCopy(copy, "footer.conductIntro", "") }) }),
      /* @__PURE__ */ jsxs15("ul", { className: "list-disc space-y-2 pl-5", children: [
        /* @__PURE__ */ jsx21("li", { children: "Be respectful and inclusive." }),
        /* @__PURE__ */ jsx21("li", { children: "Share feedback constructively." }),
        /* @__PURE__ */ jsx21("li", { children: "Respect privacy and intellectual property." }),
        /* @__PURE__ */ jsx21("li", { children: "Do not harass, discriminate, or publish private information." })
      ] }),
      /* @__PURE__ */ jsxs15("p", { children: [
        "Reports can be sent to ",
        /* @__PURE__ */ jsx21("a", { className: "text-[#15803d]", href: `mailto:${email}`, children: email }),
        "."
      ] })
    ] }) })
  ] });
};
var PolicyContent = ({ children }) => /* @__PURE__ */ jsx21("div", { className: "space-y-5 text-sm leading-7 text-[#475569]", children });
var Modal = ({ title, onClose, children }) => /* @__PURE__ */ jsx21("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm", onClick: onClose, children: /* @__PURE__ */ jsxs15("div", { className: "brand-card max-h-[90vh] w-full max-w-xl overflow-y-auto p-7 sm:p-9", onClick: (event) => event.stopPropagation(), children: [
  /* @__PURE__ */ jsxs15("div", { className: "mb-7 flex items-start justify-between gap-4", children: [
    /* @__PURE__ */ jsx21("h2", { className: "text-2xl font-black text-[#0f172a]", children: title }),
    /* @__PURE__ */ jsx21("button", { type: "button", onClick: onClose, "aria-label": "Close dialog", className: "text-[#475569] transition-colors hover:text-[#15803d]", children: /* @__PURE__ */ jsx21(X2, { className: "h-5 w-5" }) })
  ] }),
  children
] }) });

// src/components/SiteFlow.tsx
import { Fragment as Fragment9, jsx as jsx22, jsxs as jsxs16 } from "react/jsx-runtime";
var CustomBlocks = ({
  blocks,
  media
}) => /* @__PURE__ */ jsx22(Fragment9, { children: blocks.map(({ block, index }) => {
  const image = getMedia(media, `customBlocks.${block.id}.image`, { src: block.image || "", alt: block.title });
  return /* @__PURE__ */ jsx22(EditableRegion, { elementKey: `customBlocks.${block.id}.section`, label: `${block.title} custom section`, collection: "customBlocks", children: /* @__PURE__ */ jsx22("section", { className: "brand-section brand-section--alt py-24 sm:py-28", children: /* @__PURE__ */ jsxs16("div", { className: "relative z-10 mx-auto grid max-w-[1120px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.15fr_.85fr]", children: [
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx22("div", { className: "brand-eyebrow", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `customBlocks.${block.id}.eyebrow`, copyKey: `customBlocks.${index}.eyebrow`, label: "Custom section eyebrow", children: block.eyebrow }) }),
      /* @__PURE__ */ jsx22("h2", { className: "brand-title mt-5 text-4xl sm:text-5xl", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `customBlocks.${block.id}.title`, copyKey: `customBlocks.${index}.title`, label: "Custom section title", children: block.title }) }),
      /* @__PURE__ */ jsx22("p", { className: "brand-copy mt-6 max-w-2xl", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `customBlocks.${block.id}.description`, copyKey: `customBlocks.${index}.description`, label: "Custom section description", children: block.description }) }),
      /* @__PURE__ */ jsx22(EditableRegion, { elementKey: `customBlocks.${block.id}.link`, copyKey: `customBlocks.${index}.buttonLink`, label: "Custom section button link", className: "mt-8 inline-block", children: /* @__PURE__ */ jsxs16("a", { href: block.buttonLink || "#", className: "brand-button", children: [
        /* @__PURE__ */ jsx22(EditableText, { elementKey: `customBlocks.${block.id}.button`, copyKey: `customBlocks.${index}.buttonLabel`, label: "Custom section button label", children: block.buttonLabel }),
        /* @__PURE__ */ jsx22(ArrowRight4, { className: "h-4 w-4" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx22(EditableRegion, { elementKey: `customBlocks.${block.id}.image-panel`, label: "Custom section image panel", className: "brand-card relative min-h-64 overflow-hidden p-3", children: image.src ? /* @__PURE__ */ jsx22(EditableImage, { elementKey: `customBlocks.${block.id}.image`, mediaKey: `customBlocks.${block.id}.image`, label: "Custom section image", src: image.src, alt: image.alt || block.title, className: "h-full min-h-60 w-full rounded-xl object-cover" }) : /* @__PURE__ */ jsxs16("div", { className: "grid min-h-60 place-items-center rounded-xl border border-dashed border-[#16a34a]/30 bg-[#15803d]/5", children: [
      /* @__PURE__ */ jsx22(EditableImage, { elementKey: `customBlocks.${block.id}.image`, mediaKey: `customBlocks.${block.id}.image`, label: "Upload custom section image", src: "", alt: block.title, className: "absolute inset-0" }),
      /* @__PURE__ */ jsx22(ImagePlaceholder, {})
    ] }) })
  ] }) }) }, block.id);
}) });
var ImagePlaceholder = () => /* @__PURE__ */ jsx22("span", { className: "brand-number", children: "NEW VISUAL SECTION" });
var SiteFlow = ({
  siteContent,
  activeTab,
  onJoin,
  includeFooter = true,
  includeJoinCta = true
}) => {
  const content = normalizeSiteContent(siteContent);
  const copy = content.copy;
  const page = (() => {
    switch (activeTab) {
      case "home":
        return /* @__PURE__ */ jsxs16(Fragment9, { children: [
          /* @__PURE__ */ jsx22(Hero, { content: content.home, copy, media: content.media, onJoin }),
          /* @__PURE__ */ jsx22(ValueCards, { values: content.home.coreValues, copy }),
          /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "news.section", label: "Latest news section", collection: "news", children: /* @__PURE__ */ jsxs16("section", { id: "news", className: "brand-section brand-section--panel border-y border-[#16a34a]/20 py-24 sm:py-28", children: [
            /* @__PURE__ */ jsx22(PharmacyBackground, { layout: "lab" }),
            /* @__PURE__ */ jsxs16("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
              /* @__PURE__ */ jsxs16("div", { className: "mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end", children: [
                /* @__PURE__ */ jsxs16("div", { children: [
                  /* @__PURE__ */ jsx22("div", { className: "brand-eyebrow mb-5", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "news.eyebrow", copyKey: "news.eyebrow", label: "News eyebrow", children: getCopy(copy, "news.eyebrow", "Latest signal") }) }),
                  /* @__PURE__ */ jsxs16("h2", { className: "brand-title text-4xl sm:text-5xl", children: [
                    /* @__PURE__ */ jsx22(EditableText, { elementKey: "news.title", copyKey: "news.title", label: "News heading", children: getCopy(copy, "news.title", "What\u2019s moving") }),
                    /* @__PURE__ */ jsx22("br", {}),
                    /* @__PURE__ */ jsx22("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "news.title-accent", copyKey: "news.titleAccent", label: "News heading accent", children: getCopy(copy, "news.titleAccent", "the network.") }) })
                  ] })
                ] }),
                /* @__PURE__ */ jsx22(SectionLink, { id: "news" })
              ] }),
              /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "news.grid", label: "News card grid", collection: "news", className: "grid gap-4 md:grid-cols-3", children: content.home.latestNews.map((news, index) => /* @__PURE__ */ jsxs16(EditableRegion, { elementKey: `news.card.${news.id}`, label: `${news.title} news card`, collection: "news", className: "brand-card brand-card-hover p-6 sm:p-7", children: [
                /* @__PURE__ */ jsxs16("div", { className: "flex items-center justify-between", children: [
                  /* @__PURE__ */ jsxs16("span", { className: "brand-number", children: [
                    "0",
                    index + 1,
                    " / ",
                    /* @__PURE__ */ jsx22(EditableText, { elementKey: `news.card.${news.id}.category`, copyKey: `home.latestNews.${index}.category`, label: `${news.title} category`, children: news.category })
                  ] }),
                  /* @__PURE__ */ jsx22("span", { className: "h-1.5 w-1.5 rounded-full bg-[#15803d] shadow-[0_0_10px_rgba(21,128,61,0.45)]" })
                ] }),
                /* @__PURE__ */ jsx22("h3", { className: "mt-8 text-xl font-black leading-tight tracking-tight text-[#0f172a]", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `news.card.${news.id}.title`, copyKey: `home.latestNews.${index}.title`, label: `${news.title} title`, children: news.title }) }),
                /* @__PURE__ */ jsx22("p", { className: "mt-4 text-sm leading-7 text-[#475569]", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `news.card.${news.id}.text`, copyKey: `home.latestNews.${index}.text`, label: `${news.title} text`, children: news.text }) }),
                /* @__PURE__ */ jsx22("div", { className: "mt-7 h-px w-12 bg-[#15803d]/60" })
              ] }, news.id)) })
            ] })
          ] }) })
        ] });
      case "about":
        return /* @__PURE__ */ jsxs16(Fragment9, { children: [
          /* @__PURE__ */ jsx22(About, { content: content.about, copy, media: content.media }),
          /* @__PURE__ */ jsx22(WhatWeDo, { tracks: content.about.tracks, copy }),
          /* @__PURE__ */ jsx22(Leadership, { team: content.about.team, copy, media: content.media }),
          /* @__PURE__ */ jsx22(Extras, { content: content.extras, copy })
        ] });
      case "learn":
        return /* @__PURE__ */ jsx22(Academy, { content: content.learn, copy });
      case "projects":
        return /* @__PURE__ */ jsx22(Projects, { projects: content.projects, copy, media: content.media });
      case "challenges":
        return /* @__PURE__ */ jsx22(Competitions, { active: content.challenges.active, copy });
      case "community":
        return /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "community.section", label: "Community section", children: /* @__PURE__ */ jsxs16("section", { id: "community", className: "brand-section brand-grid min-h-[70vh] py-28 sm:py-36", children: [
          /* @__PURE__ */ jsx22(PharmacyBackground, { layout: "clinic" }),
          /* @__PURE__ */ jsx22("div", { className: "brand-glow right-[-12rem] top-20 opacity-50" }),
          /* @__PURE__ */ jsx22("div", { className: "relative z-10 mx-auto flex min-h-[55vh] max-w-[1440px] items-center px-5 sm:px-8 lg:px-10", children: /* @__PURE__ */ jsxs16("div", { className: "max-w-3xl", children: [
            /* @__PURE__ */ jsxs16("div", { className: "mb-6 flex items-center gap-5", children: [
              /* @__PURE__ */ jsx22("div", { className: "brand-eyebrow", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "community.eyebrow", copyKey: "community.eyebrow", label: "Community eyebrow", children: getCopy(copy, "community.eyebrow", "Community hub") }) }),
              /* @__PURE__ */ jsx22(SectionLink, { id: "community" })
            ] }),
            /* @__PURE__ */ jsxs16("h2", { className: "brand-title text-5xl sm:text-6xl lg:text-8xl", children: [
              /* @__PURE__ */ jsx22(EditableText, { elementKey: "community.title", copyKey: "community.hubTitle", label: "Community title", children: content.community.hubTitle }),
              /* @__PURE__ */ jsx22("span", { className: "brand-gradient-text block text-[0.7em]", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "community.title-accent", copyKey: "community.titleAccent", label: "Community title accent", children: getCopy(copy, "community.titleAccent", "Find your people.") }) })
            ] }),
            /* @__PURE__ */ jsx22("p", { className: "brand-copy mt-7 max-w-2xl text-base sm:text-lg", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "community.description", copyKey: "community.description", label: "Community description", children: content.community.description }) }),
            /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "community.telegram-link", copyKey: "community.telegramLink", label: "Community Telegram link", className: "mt-9 inline-block", children: /* @__PURE__ */ jsxs16("a", { href: content.community.telegramLink, target: "_blank", rel: "noopener noreferrer", className: "brand-button", children: [
              /* @__PURE__ */ jsx22(EditableText, { elementKey: "community.cta", copyKey: "community.cta", label: "Community button", children: getCopy(copy, "community.cta", "Join Telegram channel") }),
              /* @__PURE__ */ jsx22(ArrowRight4, { className: "h-4 w-4" })
            ] }) })
          ] }) })
        ] }) });
      case "resources":
        return /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "resources.section", label: "Resources section", collection: "resources", children: /* @__PURE__ */ jsxs16("section", { id: "resources", className: "brand-section brand-section--alt min-h-[70vh] py-28 sm:py-36", children: [
          /* @__PURE__ */ jsx22(PharmacyBackground, { layout: "lab" }),
          /* @__PURE__ */ jsxs16("div", { className: "relative z-10 mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-10", children: [
            /* @__PURE__ */ jsxs16("div", { className: "mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end", children: [
              /* @__PURE__ */ jsxs16("div", { children: [
                /* @__PURE__ */ jsx22("div", { className: "brand-eyebrow mb-5", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "resources.eyebrow", copyKey: "resources.eyebrow", label: "Resources eyebrow", children: getCopy(copy, "resources.eyebrow", "The library") }) }),
                /* @__PURE__ */ jsxs16("h2", { className: "brand-title text-4xl sm:text-5xl", children: [
                  /* @__PURE__ */ jsx22(EditableText, { elementKey: "resources.title", copyKey: "resources.title", label: "Resources heading", children: getCopy(copy, "resources.title", "Tools for the") }),
                  /* @__PURE__ */ jsx22("br", {}),
                  /* @__PURE__ */ jsx22("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "resources.title-accent", copyKey: "resources.titleAccent", label: "Resources heading accent", children: getCopy(copy, "resources.titleAccent", "next prescription.") }) })
                ] })
              ] }),
              /* @__PURE__ */ jsx22(SectionLink, { id: "resources" })
            ] }),
            /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "resources.grid", label: "Resource category grid", collection: "resources", className: "grid gap-4 md:grid-cols-2 lg:grid-cols-4", children: content.resources.categories.map((category, categoryIndex) => /* @__PURE__ */ jsxs16(EditableRegion, { elementKey: `resources.category.${categoryIndex}`, label: `${category.name} resource category`, collection: "resources", className: "brand-card brand-card-hover p-6 sm:p-7", children: [
              /* @__PURE__ */ jsxs16("span", { className: "brand-number", children: [
                "0",
                categoryIndex + 1,
                " / LIBRARY"
              ] }),
              /* @__PURE__ */ jsx22("h3", { className: "mt-8 text-xl font-black text-[#0f172a]", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: `resources.category.${categoryIndex}.name`, copyKey: `resources.categories.${categoryIndex}.name`, label: `${category.name} category name`, children: category.name }) }),
              /* @__PURE__ */ jsx22("ul", { className: "mt-6 space-y-3 border-t border-[#16a34a]/20 pt-5 text-sm text-[#475569]", children: category.items.map((item, itemIndex) => /* @__PURE__ */ jsxs16("li", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsx22("span", { className: "h-1.5 w-1.5 rounded-full bg-[#15803d]" }),
                /* @__PURE__ */ jsx22(EditableText, { elementKey: `resources.category.${categoryIndex}.item.${itemIndex}`, copyKey: `resources.categories.${categoryIndex}.items.${itemIndex}`, label: `${category.name} resource ${itemIndex + 1}`, children: item })
              ] }, `${item}-${itemIndex}`)) })
            ] }, `${category.name}-${categoryIndex}`)) })
          ] })
        ] }) });
      case "terms":
        return /* @__PURE__ */ jsx22(Terms, { content: content.terms, copy });
      default:
        return /* @__PURE__ */ jsx22(Hero, { content: content.home, copy, media: content.media, onJoin });
    }
  })();
  const customBlocks = content.customBlocks.map((block, index) => ({ block, index })).filter(({ block }) => block.page === activeTab);
  return /* @__PURE__ */ jsxs16(Fragment9, { children: [
    page,
    /* @__PURE__ */ jsx22(CustomBlocks, { blocks: customBlocks, media: content.media }),
    includeJoinCta && /* @__PURE__ */ jsx22(EditableRegion, { elementKey: "join.section", label: "Join call to action", children: /* @__PURE__ */ jsxs16("section", { id: "join", className: "brand-section brand-grid relative overflow-hidden border-y border-[#16a34a]/20 py-28 sm:py-36", children: [
      /* @__PURE__ */ jsx22(PharmacyBackground, { layout: "hero" }),
      /* @__PURE__ */ jsx22("div", { className: "brand-glow left-1/2 top-[-16rem] -translate-x-1/2 opacity-50" }),
      /* @__PURE__ */ jsx22("div", { className: "brand-scanlines absolute inset-0" }),
      /* @__PURE__ */ jsxs16("div", { className: "relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-8", children: [
        /* @__PURE__ */ jsxs16("div", { className: "mb-6 flex items-center justify-center gap-4", children: [
          /* @__PURE__ */ jsx22("div", { className: "brand-eyebrow", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.eyebrow", copyKey: "join.eyebrow", label: "Join eyebrow", children: getCopy(copy, "join.eyebrow", "Your next build starts here") }) }),
          /* @__PURE__ */ jsx22(SectionLink, { id: "join" })
        ] }),
        /* @__PURE__ */ jsxs16("h2", { className: "brand-title text-5xl sm:text-6xl lg:text-8xl", children: [
          /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.title", copyKey: "join.title", label: "Join heading", children: getCopy(copy, "join.title", "Ready to code") }),
          /* @__PURE__ */ jsx22("br", {}),
          /* @__PURE__ */ jsx22("span", { className: "brand-gradient-text", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.title-accent", copyKey: "join.titleAccent", label: "Join heading accent", children: getCopy(copy, "join.titleAccent", "the future?") }) })
        ] }),
        /* @__PURE__ */ jsx22("p", { className: "brand-copy mx-auto mt-7 max-w-2xl text-base sm:text-lg", children: /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.description", copyKey: "join.description", label: "Join description", children: getCopy(copy, "join.description", "") }) }),
        /* @__PURE__ */ jsxs16("div", { className: "mt-9 flex flex-col justify-center gap-3 sm:flex-row", children: [
          /* @__PURE__ */ jsxs16(motion.button, { type: "button", whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 }, onClick: onJoin, className: "brand-button", children: [
            /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.primary-cta", copyKey: "join.primaryCta", label: "Join primary button", children: getCopy(copy, "join.primaryCta", "Join the society") }),
            /* @__PURE__ */ jsx22(ArrowRight4, { className: "h-4 w-4" })
          ] }),
          /* @__PURE__ */ jsxs16(motion.button, { type: "button", whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 }, onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }), className: "brand-button brand-button--ghost", children: [
            /* @__PURE__ */ jsx22(EditableText, { elementKey: "join.secondary-cta", copyKey: "join.secondaryCta", label: "Join secondary button", children: getCopy(copy, "join.secondaryCta", "Back to top") }),
            /* @__PURE__ */ jsx22(ArrowRight4, { className: "h-4 w-4 -rotate-45" })
          ] })
        ] })
      ] })
    ] }) }),
    includeFooter && /* @__PURE__ */ jsx22(Footer, { copy: content.copy, links: content.links, media: content.media })
  ] });
};

// src/components/Dashboard.tsx
import { useEffect as useEffect7, useState as useState7 } from "react";
import { Archive, ArrowLeft as ArrowLeft2, BookOpen as BookOpen2, Code2 as Code25, FolderKanban, Home, LayoutDashboard, LogOut, Menu, MessageSquare, Search, Settings, Trophy as Trophy3, UserRound, Users as Users4, X as X4, Zap as Zap2 } from "lucide-react";

// src/components/NotificationCenter.tsx
import { useEffect as useEffect6, useMemo as useMemo7, useState as useState6 } from "react";
import { Bell, Check as Check2, Send as Send3, Trash2, Users as Users3, X as X3 } from "lucide-react";

// src/components/RecentItems.tsx
import { useState as useState5 } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment as Fragment10, jsx as jsx23, jsxs as jsxs17 } from "react/jsx-runtime";
var RecentItems = ({
  items,
  render: render2,
  label = "entries",
  limit = 3,
  className = ""
}) => {
  const [expanded, setExpanded] = useState5(false);
  const visible = expanded ? items : items.slice(0, limit);
  const remaining = Math.max(0, items.length - limit);
  return /* @__PURE__ */ jsxs17(Fragment10, { children: [
    visible.map(render2),
    remaining > 0 && /* @__PURE__ */ jsxs17("button", { type: "button", onClick: () => setExpanded((current) => !current), className: `mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 ${className}`, children: [
      expanded ? /* @__PURE__ */ jsx23(ChevronUp, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsx23(ChevronDown, { className: "h-3.5 w-3.5" }),
      expanded ? `Show fewer ${label}` : `Show ${remaining} more ${label}`
    ] })
  ] });
};

// src/components/NotificationCenter.tsx
import { Fragment as Fragment11, jsx as jsx24, jsxs as jsxs18 } from "react/jsx-runtime";
var when = (value) => value ? new Date(value).toLocaleString(void 0, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "\u2014";
var NotificationCenter = () => {
  const [open, setOpen] = useState6(false);
  const [compose, setCompose] = useState6(false);
  const [inbox, setInbox] = useState6({ items: [], unreadCount: 0, canSend: false });
  const [audienceData, setAudienceData] = useState6({ members: [], roles: [] });
  const [loading, setLoading] = useState6(false);
  const [dismissingId, setDismissingId] = useState6(null);
  const [title, setTitle] = useState6("");
  const [message, setMessage] = useState6("");
  const [audience, setAudience] = useState6("all");
  const [selected, setSelected] = useState6([]);
  const [roleCode, setRoleCode] = useState6("");
  const [sendMessage, setSendMessage] = useState6("");
  const [inboxMessage, setInboxMessage] = useState6("");
  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setInbox(await db.notifications.inbox());
    } finally {
      if (!quiet) setLoading(false);
    }
  };
  useEffect6(() => {
    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, 3e4);
    return () => window.clearInterval(timer);
  }, []);
  const openComposer = async () => {
    setCompose(true);
    setSendMessage("");
    if (!audienceData.members.length) {
      try {
        setAudienceData(await db.notifications.audience());
      } catch (error) {
        setSendMessage(error?.message || "Could not load notification audiences.");
      }
    }
  };
  const markRead = async (item) => {
    if (item.status === "read") return;
    try {
      await db.notifications.markRead(item.id);
      setInbox((current) => ({
        ...current,
        unreadCount: Math.max(0, Number(current.unreadCount || 0) - 1),
        items: current.items.map((entry) => entry.id === item.id ? { ...entry, status: "read", read_at: (/* @__PURE__ */ new Date()).toISOString() } : entry)
      }));
    } catch {
    }
  };
  const dismiss = async (item) => {
    setDismissingId(item.id);
    setInboxMessage("");
    try {
      await db.notifications.dismiss(item.id);
      setInbox((current) => ({
        ...current,
        unreadCount: item.status === "unread" ? Math.max(0, Number(current.unreadCount || 0) - 1) : Number(current.unreadCount || 0),
        items: current.items.filter((entry) => entry.id !== item.id)
      }));
      setInboxMessage("Notification moved to the Recycle Bin.");
    } catch (error) {
      setInboxMessage(error?.message || "Could not remove this notification.");
    } finally {
      setDismissingId(null);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    setSendMessage("");
    if (!title.trim() || !message.trim()) {
      setSendMessage("Add a title and message before sending.");
      return;
    }
    if (audience === "selected" && !selected.length) {
      setSendMessage("Choose at least one active member.");
      return;
    }
    if (audience === "role" && !roleCode) {
      setSendMessage("Choose a responsibility profile.");
      return;
    }
    setLoading(true);
    try {
      const result = await db.notifications.send({ title, message, audience, memberProfileIds: selected, roleCode });
      setSendMessage(result.message || "Notification broadcast successfully.");
      setTitle("");
      setMessage("");
      setSelected([]);
      setRoleCode("");
      await load(true);
    } catch (error) {
      setSendMessage(error?.message || "Could not send this notification.");
    } finally {
      setLoading(false);
    }
  };
  const selectedLabel = useMemo7(() => `${selected.length} selected`, [selected.length]);
  const items = inbox.items || [];
  return /* @__PURE__ */ jsxs18("div", { className: "relative", children: [
    /* @__PURE__ */ jsxs18("button", { onClick: () => {
      setOpen((value) => !value);
      setCompose(false);
      setInboxMessage("");
    }, className: "relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700", "aria-label": "Open notifications", children: [
      /* @__PURE__ */ jsx24(Bell, { className: "h-4 w-4" }),
      Number(inbox.unreadCount || 0) > 0 && /* @__PURE__ */ jsx24("span", { className: "absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 py-0.5 text-center text-[9px] font-black text-white", children: Number(inbox.unreadCount) > 99 ? "99+" : inbox.unreadCount })
    ] }),
    open && /* @__PURE__ */ jsxs18("div", { className: "absolute right-0 top-12 z-[160] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl", children: [
      /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between border-b border-slate-100 px-4 py-3", children: [
        /* @__PURE__ */ jsxs18("div", { children: [
          /* @__PURE__ */ jsx24("p", { className: "text-sm font-black text-slate-900", children: "Notifications" }),
          /* @__PURE__ */ jsxs18("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-400", children: [
            inbox.unreadCount || 0,
            " unread"
          ] })
        ] }),
        /* @__PURE__ */ jsxs18("div", { className: "flex items-center gap-2", children: [
          inbox.canSend && /* @__PURE__ */ jsxs18("button", { onClick: () => void openComposer(), className: "rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700", children: [
            /* @__PURE__ */ jsx24(Send3, { className: "mr-1 inline h-3.5 w-3.5" }),
            "Send"
          ] }),
          /* @__PURE__ */ jsx24("button", { onClick: () => setOpen(false), className: "rounded-lg p-2 text-slate-400 hover:bg-slate-100", children: /* @__PURE__ */ jsx24(X3, { className: "h-4 w-4" }) })
        ] })
      ] }),
      compose ? /* @__PURE__ */ jsxs18("form", { onSubmit: send, className: "max-h-[70vh] overflow-y-auto p-4", children: [
        /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs18("div", { children: [
            /* @__PURE__ */ jsx24("p", { className: "text-sm font-black text-slate-900", children: "Broadcast update" }),
            /* @__PURE__ */ jsx24("p", { className: "mt-1 text-xs text-slate-500", children: "Your PHANTOM-approved sender access is active." })
          ] }),
          /* @__PURE__ */ jsx24("button", { type: "button", onClick: () => setCompose(false), className: "text-xs font-black text-emerald-700", children: "Inbox" })
        ] }),
        /* @__PURE__ */ jsx24("input", { value: title, onChange: (event) => setTitle(event.target.value), maxLength: 180, placeholder: "Notification title", className: "mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" }),
        /* @__PURE__ */ jsx24("textarea", { value: message, onChange: (event) => setMessage(event.target.value), maxLength: 5e3, placeholder: "Write a clear update for recipients\u2026", className: "mt-3 min-h-28 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-400" }),
        /* @__PURE__ */ jsxs18("label", { className: "mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500", children: [
          "Audience",
          /* @__PURE__ */ jsxs18("select", { value: audience, onChange: (event) => setAudience(event.target.value), className: "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800", children: [
            /* @__PURE__ */ jsx24("option", { value: "all", children: "All active members" }),
            /* @__PURE__ */ jsx24("option", { value: "selected", children: "Selected members" }),
            /* @__PURE__ */ jsx24("option", { value: "role", children: "Responsibility profile" })
          ] })
        ] }),
        audience === "role" && /* @__PURE__ */ jsxs18("select", { value: roleCode, onChange: (event) => setRoleCode(event.target.value), className: "mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm", children: [
          /* @__PURE__ */ jsx24("option", { value: "", children: "Choose responsibility profile" }),
          (audienceData.roles || []).map((role) => /* @__PURE__ */ jsx24("option", { value: role.code, children: role.name }, role.code))
        ] }),
        audience === "selected" && /* @__PURE__ */ jsxs18("div", { className: "mt-3 rounded-xl border border-slate-200", children: [
          /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between border-b border-slate-100 px-3 py-2", children: [
            /* @__PURE__ */ jsx24("span", { className: "text-xs font-black text-slate-700", children: selectedLabel }),
            /* @__PURE__ */ jsx24(Users3, { className: "h-4 w-4 text-slate-400" })
          ] }),
          /* @__PURE__ */ jsx24("div", { className: "max-h-40 overflow-y-auto p-2", children: (audienceData.members || []).map((member) => /* @__PURE__ */ jsxs18("label", { className: "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-emerald-50", children: [
            /* @__PURE__ */ jsx24("input", { type: "checkbox", checked: selected.includes(member.id), onChange: () => setSelected((current) => current.includes(member.id) ? current.filter((id3) => id3 !== member.id) : [...current, member.id]) }),
            /* @__PURE__ */ jsxs18("span", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx24("strong", { className: "block truncate text-slate-800", children: member.name }),
              /* @__PURE__ */ jsxs18("small", { className: "text-slate-500", children: [
                member.member_code,
                " \xB7 ",
                member.role_name || member.role_code
              ] })
            ] })
          ] }, member.id)) })
        ] }),
        sendMessage && /* @__PURE__ */ jsx24("p", { className: `mt-3 rounded-xl px-3 py-2 text-xs font-medium ${sendMessage.includes("success") || sendMessage.includes("broadcast") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`, children: sendMessage }),
        /* @__PURE__ */ jsxs18("button", { disabled: loading, className: "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-60", children: [
          /* @__PURE__ */ jsx24(Send3, { className: "h-4 w-4" }),
          loading ? "Sending\u2026" : "Send notification"
        ] })
      ] }) : /* @__PURE__ */ jsxs18("div", { className: "max-h-[65vh] overflow-y-auto p-2", children: [
        inboxMessage && /* @__PURE__ */ jsx24("p", { role: "status", className: `m-1 rounded-xl px-3 py-2 text-xs font-bold ${!inboxMessage.startsWith("Could not") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`, children: inboxMessage }),
        loading ? /* @__PURE__ */ jsx24("div", { className: "grid min-h-40 place-items-center text-xs font-bold text-emerald-700", children: "Loading notifications\u2026" }) : items.length ? /* @__PURE__ */ jsx24(Fragment11, { children: /* @__PURE__ */ jsx24(RecentItems, { items, label: "notifications", render: (item) => /* @__PURE__ */ jsxs18("article", { className: `relative mb-1 rounded-xl transition hover:bg-emerald-50 ${item.status === "unread" ? "bg-emerald-50/60" : ""}`, children: [
          /* @__PURE__ */ jsxs18("button", { onClick: () => void markRead(item), className: "w-full p-3 pr-11 text-left", children: [
            /* @__PURE__ */ jsxs18("div", { className: "flex items-start justify-between gap-3", children: [
              /* @__PURE__ */ jsx24("strong", { className: "text-sm text-slate-900", children: item.title }),
              item.status === "unread" && /* @__PURE__ */ jsx24("span", { className: "mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" })
            ] }),
            /* @__PURE__ */ jsx24("p", { className: "mt-1 text-xs leading-5 text-slate-600", children: item.message }),
            /* @__PURE__ */ jsxs18("p", { className: "mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400", children: [
              item.sender_name || "Code Rx Society",
              " \xB7 ",
              when(item.delivered_at)
            ] })
          ] }),
          /* @__PURE__ */ jsx24("button", { disabled: dismissingId === item.id, onClick: () => void dismiss(item), "aria-label": `Remove notification: ${item.title}`, title: "Remove from my inbox", className: "absolute right-2 top-2 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50", children: /* @__PURE__ */ jsx24(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }, item.id) }) }) : /* @__PURE__ */ jsx24("div", { className: "grid min-h-40 place-items-center text-center", children: /* @__PURE__ */ jsxs18("div", { children: [
          /* @__PURE__ */ jsx24(Check2, { className: "mx-auto h-6 w-6 text-emerald-600" }),
          /* @__PURE__ */ jsx24("p", { className: "mt-2 text-sm font-bold text-slate-700", children: "You are up to date" }),
          /* @__PURE__ */ jsx24("p", { className: "mt-1 text-xs text-slate-500", children: "New broadcasts will appear here." })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx24("div", { className: "border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-500", children: "Three recent notifications are shown first. Open more whenever you need them." })
    ] })
  ] });
};

// src/components/Dashboard.tsx
import { jsx as jsx25, jsxs as jsxs19 } from "react/jsx-runtime";
var browsePublic = (target) => {
  window.location.hash = target;
};
var Dashboard = ({
  user,
  onOpenVault,
  onOpenCommunity,
  onBackToSite,
  onSignOut
}) => {
  const [view, setView] = useState7("overview");
  const [member, setMember] = useState7(null);
  const [leaderboard, setLeaderboard] = useState7([]);
  const [vaultHome, setVaultHome] = useState7(null);
  const [projects, setProjects] = useState7([]);
  const [notifications, setNotifications] = useState7({ items: [], unreadCount: 0 });
  const [memberError, setMemberError] = useState7("");
  const [loading, setLoading] = useState7(true);
  const [navigationOpen, setNavigationOpen] = useState7(() => window.innerWidth >= 1024);
  const firstName = user?.name?.split(" ")[0] || "Member";
  const initial = (user?.name || user?.email || "C").charAt(0).toUpperCase();
  const loadPortal = async () => {
    setLoading(true);
    const [profile, scores, home, projectRows, inbox] = await Promise.allSettled([db.member.me(), db.member.leaderboard(10), db.vault.home(), db.vault.projects(), db.notifications.inbox()]);
    if (profile.status === "fulfilled") {
      setMember(profile.value);
      setMemberError("");
    } else setMemberError(profile.reason?.message || "Member profile could not be loaded.");
    if (scores.status === "fulfilled") setLeaderboard(scores.value);
    if (home.status === "fulfilled") setVaultHome(home.value);
    if (projectRows.status === "fulfilled") setProjects(projectRows.value);
    if (inbox.status === "fulfilled") setNotifications(inbox.value);
    setLoading(false);
  };
  useEffect7(() => {
    void loadPortal();
  }, []);
  const navigation = [
    { icon: LayoutDashboard, label: "Overview", id: "overview" },
    { icon: BookOpen2, label: "My Courses", id: "courses" },
    { icon: Code25, label: "My Projects", id: "projects" },
    { icon: Trophy3, label: "Challenges", id: "challenges" },
    { icon: MessageSquare, label: "Community", id: "community" },
    { icon: Archive, label: "Code Rx Vault", id: "vault" },
    { icon: Settings, label: "Profile", id: "profile" }
  ];
  const content = view === "profile" ? /* @__PURE__ */ jsx25(Profile, { member, error: memberError, onOpenVault }) : view === "courses" ? /* @__PURE__ */ jsx25(CoursesView, {}) : view === "projects" ? /* @__PURE__ */ jsx25(ProjectsView, { projects, onOpenVault }) : view === "challenges" ? /* @__PURE__ */ jsx25(ChallengesView, {}) : view === "community" ? /* @__PURE__ */ jsx25(CommunityView, { notifications: notifications.items || [] }) : /* @__PURE__ */ jsx25(Overview, { firstName, member, leaderboard, vaultHome, notifications, memberError, loading, onOpenVault });
  const sidebar = /* @__PURE__ */ jsxs19("aside", { className: "h-fit w-full rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm lg:w-64", children: [
    /* @__PURE__ */ jsxs19("div", { className: "mb-4 flex items-center justify-between border-b border-slate-100 px-2 pb-4", children: [
      /* @__PURE__ */ jsxs19("div", { className: "flex min-w-0 items-center gap-3", children: [
        /* @__PURE__ */ jsx25("div", { className: "grid h-11 w-11 place-items-center rounded-full bg-[#fff1ae] text-lg font-black text-slate-800", children: initial }),
        /* @__PURE__ */ jsxs19("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsx25("h4", { className: "truncate font-bold text-slate-800", children: user?.name || "Member" }),
          /* @__PURE__ */ jsx25("p", { className: "truncate text-[10px] font-bold uppercase tracking-widest text-slate-500", children: member?.memberCode || user?.email || "Code Rx Member" }),
          member?.codename && /* @__PURE__ */ jsx25("p", { className: "mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600", children: member.codename })
        ] })
      ] }),
      /* @__PURE__ */ jsx25("button", { onClick: () => setNavigationOpen(false), className: "rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden", children: /* @__PURE__ */ jsx25(X4, { className: "h-4 w-4" }) })
    ] }),
    /* @__PURE__ */ jsx25("nav", { className: "space-y-1", children: navigation.map((item) => /* @__PURE__ */ jsxs19("button", { onClick: () => {
      if (item.id === "vault") onOpenVault();
      else if (item.id === "community") onOpenCommunity();
      else setView(item.id);
      setNavigationOpen(false);
    }, className: `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${view === item.id ? "bg-[#fff1ae] font-bold text-slate-800 shadow-md shadow-amber-200/50" : "text-slate-500 hover:bg-emerald-50 hover:text-slate-800"}`, children: [
      /* @__PURE__ */ jsx25(item.icon, { className: "h-5 w-5" }),
      item.label
    ] }, item.label)) })
  ] });
  return /* @__PURE__ */ jsxs19("div", { className: "min-h-screen bg-[#f7faf8]", children: [
    /* @__PURE__ */ jsx25("header", { className: "sticky top-0 z-40 border-b border-emerald-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-7", children: /* @__PURE__ */ jsxs19("div", { className: "mx-auto flex max-w-[1600px] items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs19("div", { className: "flex min-w-0 items-center gap-2 sm:gap-3", children: [
        /* @__PURE__ */ jsx25("button", { onClick: () => setNavigationOpen((current) => !current), className: "rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800 hover:bg-emerald-100", "aria-label": navigationOpen ? "Hide portal navigation" : "Show portal navigation", children: /* @__PURE__ */ jsx25(Menu, { className: "h-5 w-5" }) }),
        /* @__PURE__ */ jsxs19("button", { onClick: () => {
          setView("overview");
          setNavigationOpen(false);
        }, className: "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100", title: "Member Portal home", children: [
          /* @__PURE__ */ jsx25(Home, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx25("span", { className: "hidden sm:inline", children: "Home" })
        ] }),
        /* @__PURE__ */ jsx25("img", { src: "/CODE%20RX11.png", alt: "Code Rx Society", className: "h-10 w-10 shrink-0 object-contain" }),
        /* @__PURE__ */ jsxs19("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxs19("p", { className: "truncate text-sm font-black tracking-wide text-slate-900", children: [
            "CODE ",
            /* @__PURE__ */ jsx25("span", { className: "text-emerald-600", children: "Rx" }),
            " MEMBER PORTAL"
          ] }),
          /* @__PURE__ */ jsx25("p", { className: "truncate text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700", children: "Wide member workspace" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs19("div", { className: "flex shrink-0 items-center gap-2", children: [
        /* @__PURE__ */ jsxs19("button", { onClick: onBackToSite, className: "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-600 hover:bg-slate-50", title: "Back to website", children: [
          /* @__PURE__ */ jsx25(ArrowLeft2, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx25("span", { className: "hidden md:inline", children: "Website" })
        ] }),
        /* @__PURE__ */ jsx25(NotificationCenter, {}),
        /* @__PURE__ */ jsxs19("button", { onClick: onSignOut, className: "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-600 hover:bg-slate-50", title: "Sign out", children: [
          /* @__PURE__ */ jsx25(LogOut, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx25("span", { className: "hidden sm:inline", children: "Sign out" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx25("div", { className: "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 lg:px-10", children: /* @__PURE__ */ jsxs19("div", { className: "flex gap-6", children: [
      navigationOpen && /* @__PURE__ */ jsx25("div", { className: "hidden shrink-0 lg:block", children: sidebar }),
      /* @__PURE__ */ jsx25("main", { className: "min-w-0 flex-1", children: content })
    ] }) }),
    navigationOpen && /* @__PURE__ */ jsxs19("div", { className: "fixed inset-0 z-50 lg:hidden", children: [
      /* @__PURE__ */ jsx25("button", { className: "absolute inset-0 bg-slate-950/25", "aria-label": "Close navigation", onClick: () => setNavigationOpen(false) }),
      /* @__PURE__ */ jsx25("div", { className: "relative h-full w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto bg-[#f7faf8] p-4 shadow-2xl", children: sidebar })
    ] })
  ] });
};
var Overview = ({ firstName, member, leaderboard, vaultHome, notifications, memberError, loading, onOpenVault }) => {
  const accessibleDocuments = (vaultHome?.sections || []).reduce((total, section) => total + Number(section.documentCount || 0), 0);
  return /* @__PURE__ */ jsxs19("div", { className: "space-y-8", children: [
    /* @__PURE__ */ jsxs19("header", { className: "flex flex-wrap items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs19("div", { children: [
        /* @__PURE__ */ jsxs19("h2", { className: "text-3xl font-black text-slate-800", children: [
          "Welcome, ",
          firstName,
          " ",
          /* @__PURE__ */ jsx25(SiteEmoji, { character: "\u{1F44B}" })
        ] }),
        /* @__PURE__ */ jsx25("p", { className: "text-slate-500", children: "Your real Code Rx member space is ready for learning, building, and contributing." })
      ] }),
      /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxs19("div", { className: "relative", children: [
          /* @__PURE__ */ jsx25(Search, { className: "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }),
          /* @__PURE__ */ jsx25("input", { type: "text", placeholder: "Search resources...", className: "rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#fff1ae]" })
        ] }),
        /* @__PURE__ */ jsx25(NotificationCenter, {})
      ] })
    ] }),
    memberError && /* @__PURE__ */ jsx25("p", { className: "rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600", children: memberError }),
    /* @__PURE__ */ jsx25("div", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [{ label: "Calcitonins", value: `${Number(member?.points || 0).toLocaleString()} CAL`, icon: Zap2, color: "text-amber-700", bg: "bg-amber-100" }, { label: "Accessible Docs", value: loading ? "\u2014" : accessibleDocuments.toLocaleString(), icon: BookOpen2, color: "text-sky-700", bg: "bg-sky-100" }, { label: "Projects", value: loading ? "\u2014" : String((vaultHome?.sections || []).find((section) => section.slug === "projects")?.documentCount || 0), icon: FolderKanban, color: "text-violet-700", bg: "bg-violet-100" }, { label: "Updates", value: Number(notifications?.unreadCount || 0).toLocaleString(), icon: MessageSquare, color: "text-emerald-700", bg: "bg-emerald-100" }].map((stat) => /* @__PURE__ */ jsxs19("div", { className: "rounded-2xl border border-slate-100 bg-white p-6 shadow-sm", children: [
      /* @__PURE__ */ jsx25("div", { className: `${stat.bg} ${stat.color} mb-4 grid h-10 w-10 place-items-center rounded-lg`, children: /* @__PURE__ */ jsx25(stat.icon, { className: "h-6 w-6" }) }),
      /* @__PURE__ */ jsx25("p", { className: "text-xs font-bold uppercase tracking-widest text-slate-400", children: stat.label }),
      /* @__PURE__ */ jsx25("p", { className: "text-2xl font-black text-slate-800", children: stat.value })
    ] }, stat.label)) }),
    /* @__PURE__ */ jsxs19("div", { className: "grid gap-8 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsxs19("div", { className: "space-y-6 lg:col-span-2", children: [
        /* @__PURE__ */ jsx25("section", { className: "rounded-3xl border border-emerald-100 bg-[#f2fbf5] p-7 shadow-sm", children: /* @__PURE__ */ jsxs19("div", { className: "flex items-start justify-between gap-4", children: [
          /* @__PURE__ */ jsxs19("div", { children: [
            /* @__PURE__ */ jsx25("p", { className: "text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700", children: "Calcitonin balance" }),
            /* @__PURE__ */ jsx25("h3", { className: "mt-2 text-xl font-black text-slate-800", children: "Your verified Calcitonin balance" }),
            /* @__PURE__ */ jsx25("p", { className: "mt-2 max-w-xl text-sm leading-6 text-slate-600", children: "PHANTOM-approved adjustments and verified achievements update your Calcitonins. Every change is recorded in your notification inbox." })
          ] }),
          /* @__PURE__ */ jsxs19("span", { className: "rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-2xl font-black text-emerald-700 shadow-sm", children: [
            Number(member?.points || 0).toLocaleString(),
            " CAL"
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs19("section", { className: "rounded-3xl border border-slate-100 bg-white p-8 shadow-sm", children: [
          /* @__PURE__ */ jsxs19("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs19("div", { children: [
              /* @__PURE__ */ jsx25("h3", { className: "text-xl font-black text-slate-800", children: "Recent Vault work" }),
              /* @__PURE__ */ jsx25("p", { className: "mt-1 text-sm text-slate-500", children: "Only real documents you can access appear here." })
            ] }),
            /* @__PURE__ */ jsx25("button", { onClick: onOpenVault, className: "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100", children: "Open Vault" })
          ] }),
          /* @__PURE__ */ jsxs19("div", { className: "mt-5 space-y-2", children: [
            /* @__PURE__ */ jsx25(RecentItems, { items: vaultHome?.recentDocuments || [], label: "documents", render: (document2) => /* @__PURE__ */ jsxs19("div", { className: "rounded-xl border border-slate-100 px-4 py-3", children: [
              /* @__PURE__ */ jsx25("p", { className: "font-bold text-slate-800", children: document2.title }),
              /* @__PURE__ */ jsxs19("p", { className: "mt-1 text-xs text-slate-500", children: [
                document2.document_code ? `${document2.document_code} \xB7 ` : "",
                document2.section_title || document2.section_slug
              ] })
            ] }, document2.id) }),
            !(vaultHome?.recentDocuments || []).length && /* @__PURE__ */ jsx25(EmptyPanel, { icon: Archive, title: "No Vault documents yet", text: "Open the Vault when you are ready to review or contribute to Society documentation.", action: "Open Vault", onAction: onOpenVault })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx25(Leaderboard, { leaderboard })
    ] })
  ] });
};
var CoursesView = () => /* @__PURE__ */ jsx25(PortalPage, { eyebrow: "Learning", title: "My Courses", text: "You have not started a tracked course yet. Course progress will appear here once the Academy learning records are connected to your member account.", icon: BookOpen2, action: "Explore Academy", onAction: () => browsePublic("learn") });
var ProjectsView = ({ projects, onOpenVault }) => /* @__PURE__ */ jsxs19("div", { className: "space-y-6", children: [
  /* @__PURE__ */ jsx25(PortalHeader, { eyebrow: "Projects", title: "My Projects", text: "Real Vault projects you are allowed to view are listed here." }),
  projects.length ? /* @__PURE__ */ jsx25("div", { className: "grid gap-4 md:grid-cols-2", children: projects.map((project) => /* @__PURE__ */ jsxs19("article", { className: "rounded-2xl border border-slate-100 bg-white p-6 shadow-sm", children: [
    /* @__PURE__ */ jsx25("p", { className: "text-[10px] font-black uppercase tracking-widest text-emerald-600", children: project.status || "Planning" }),
    /* @__PURE__ */ jsx25("h3", { className: "mt-2 text-lg font-black text-slate-800", children: project.title }),
    /* @__PURE__ */ jsx25("p", { className: "mt-2 text-sm leading-6 text-slate-500", children: project.description || "No project summary has been added yet." })
  ] }, project.id)) }) : /* @__PURE__ */ jsx25(PortalPage, { eyebrow: "Projects", title: "No accessible projects yet", text: "When PHANTOM or your role grants access to a Vault project, it will appear here.", icon: FolderKanban, action: "Open Vault Projects", onAction: onOpenVault })
] });
var ChallengesView = () => /* @__PURE__ */ jsx25(PortalPage, { eyebrow: "Challenges", title: "No active challenges announced", text: "Challenge activity is not fabricated for new members. New challenges will appear here when the Society publishes them.", icon: Trophy3, action: "Explore public challenges", onAction: () => browsePublic("challenges") });
var CommunityView = ({ notifications }) => /* @__PURE__ */ jsxs19("div", { className: "space-y-6", children: [
  /* @__PURE__ */ jsx25(PortalHeader, { eyebrow: "Community", title: "Community updates", text: "Real PHANTOM and delegated-member broadcasts are shown below." }),
  notifications.length ? /* @__PURE__ */ jsx25("div", { className: "space-y-3", children: /* @__PURE__ */ jsx25(RecentItems, { items: notifications, label: "community updates", render: (notification) => /* @__PURE__ */ jsx25("article", { className: "rounded-2xl border border-slate-100 bg-white p-5 shadow-sm", children: /* @__PURE__ */ jsxs19("div", { className: "flex items-start justify-between gap-4", children: [
    /* @__PURE__ */ jsxs19("div", { children: [
      /* @__PURE__ */ jsx25("p", { className: "font-black text-slate-800", children: notification.title }),
      /* @__PURE__ */ jsx25("p", { className: "mt-2 text-sm leading-6 text-slate-600", children: notification.message }),
      /* @__PURE__ */ jsxs19("p", { className: "mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400", children: [
        notification.sender_name || "Code Rx Society",
        " \xB7 ",
        notification.delivered_at || notification.created_at
      ] })
    ] }),
    notification.status === "unread" && /* @__PURE__ */ jsx25("span", { className: "mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" })
  ] }) }, notification.id) }) }) : /* @__PURE__ */ jsx25(PortalPage, { eyebrow: "Community", title: "No community updates yet", text: "PHANTOM broadcasts and approved community notices will appear here when they are sent.", icon: Users4, action: "Explore public community", onAction: () => browsePublic("community") })
] });
var Leaderboard = ({ leaderboard }) => /* @__PURE__ */ jsxs19("section", { className: "rounded-3xl border border-slate-100 bg-white p-8 shadow-sm", children: [
  /* @__PURE__ */ jsxs19("div", { className: "mb-6 flex items-center justify-between", children: [
    /* @__PURE__ */ jsx25("h3", { className: "text-xl font-black text-slate-800", children: "Live Leaderboard" }),
    /* @__PURE__ */ jsx25(Trophy3, { className: "h-5 w-5 text-amber-500" })
  ] }),
  /* @__PURE__ */ jsx25("div", { className: "space-y-4", children: leaderboard.length ? leaderboard.slice(0, 10).map((entry) => /* @__PURE__ */ jsxs19("div", { className: "flex items-center justify-between", children: [
    /* @__PURE__ */ jsxs19("div", { className: "flex min-w-0 items-center gap-3", children: [
      /* @__PURE__ */ jsxs19("span", { className: "w-7 text-sm font-black text-slate-400", children: [
        "#",
        entry.rank
      ] }),
      /* @__PURE__ */ jsx25("span", { className: "grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-sm", children: /* @__PURE__ */ jsx25(SiteEmoji, { character: entry.rank === 1 ? "\u{1F3C6}" : entry.rank === 2 ? "\u{1F948}" : entry.rank === 3 ? "\u{1F949}" : "\u2726" }) }),
      /* @__PURE__ */ jsxs19("span", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx25("span", { className: "block truncate font-bold text-slate-800", children: entry.display_name }),
        /* @__PURE__ */ jsx25("small", { className: "block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400", children: entry.level || entry.member_code })
      ] })
    ] }),
    /* @__PURE__ */ jsxs19("span", { className: "text-sm font-black text-emerald-700", children: [
      Number(entry.points || 0).toLocaleString(),
      " CAL"
    ] })
  ] }, entry.member_profile_id)) : /* @__PURE__ */ jsx25("p", { className: "text-sm text-slate-500", children: "Calcitonin balances will appear here as members contribute." }) })
] });
var Profile = ({ member, error, onOpenVault }) => /* @__PURE__ */ jsxs19("div", { className: "rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-9", children: [
  /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ jsx25(UserRound, { className: "h-7 w-7 text-emerald-600" }),
    /* @__PURE__ */ jsxs19("div", { children: [
      /* @__PURE__ */ jsx25("p", { className: "text-[10px] font-black uppercase tracking-widest text-emerald-600", children: "Code Rx identity" }),
      /* @__PURE__ */ jsx25("h2", { className: "text-2xl font-black text-slate-800", children: "Member profile" })
    ] })
  ] }),
  error ? /* @__PURE__ */ jsx25("p", { className: "mt-5 text-sm text-red-600", children: error }) : /* @__PURE__ */ jsxs19("div", { className: "mt-7 grid gap-4 sm:grid-cols-2", children: [
    /* @__PURE__ */ jsx25(ProfileField, { label: "Member ID", value: member?.memberCode || "Loading\u2026" }),
    /* @__PURE__ */ jsx25(ProfileField, { label: "Code Name", value: member?.codename || "Not selected yet" }),
    /* @__PURE__ */ jsx25(ProfileField, { label: "CAL Level", value: member?.level || "Rx Initiate" }),
    /* @__PURE__ */ jsx25(ProfileField, { label: "Calcitonins", value: `${Number(member?.points || 0).toLocaleString()} CAL` }),
    /* @__PURE__ */ jsx25(ProfileField, { label: "Responsibility", value: member?.role?.name || "Member Responsibility" }),
    /* @__PURE__ */ jsx25(ProfileField, { label: "Account status", value: member?.memberStatus || "\u2014" })
  ] }),
  /* @__PURE__ */ jsx25("button", { onClick: onOpenVault, className: "mt-7 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100", children: "Open Code Rx Vault" })
] });
var PortalHeader = ({ eyebrow, title, text }) => /* @__PURE__ */ jsxs19("header", { children: [
  /* @__PURE__ */ jsx25("p", { className: "text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600", children: eyebrow }),
  /* @__PURE__ */ jsx25("h2", { className: "mt-2 text-3xl font-black text-slate-800", children: title }),
  /* @__PURE__ */ jsx25("p", { className: "mt-3 max-w-2xl text-sm leading-6 text-slate-500", children: text })
] });
var PortalPage = ({ eyebrow, title, text, icon: Icon, action, onAction }) => /* @__PURE__ */ jsxs19("div", { className: "rounded-3xl border border-slate-100 bg-white p-8 shadow-sm", children: [
  /* @__PURE__ */ jsx25(PortalHeader, { eyebrow, title, text }),
  /* @__PURE__ */ jsx25("div", { className: "mt-8 grid min-h-48 place-items-center rounded-2xl border border-dashed border-emerald-200 bg-[#f5fcf7] text-center", children: /* @__PURE__ */ jsxs19("div", { children: [
    /* @__PURE__ */ jsx25("div", { className: "mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm", children: /* @__PURE__ */ jsx25(Icon, { className: "h-6 w-6" }) }),
    /* @__PURE__ */ jsx25("button", { onClick: onAction, className: "mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50", children: action })
  ] }) })
] });
var EmptyPanel = ({ icon: Icon, title, text, action, onAction }) => /* @__PURE__ */ jsxs19("div", { className: "rounded-2xl border border-dashed border-emerald-200 bg-[#f5fcf7] p-6 text-center", children: [
  /* @__PURE__ */ jsx25(Icon, { className: "mx-auto h-7 w-7 text-emerald-600" }),
  /* @__PURE__ */ jsx25("h4", { className: "mt-3 font-black text-slate-800", children: title }),
  /* @__PURE__ */ jsx25("p", { className: "mt-2 text-sm leading-6 text-slate-500", children: text }),
  /* @__PURE__ */ jsx25("button", { onClick: onAction, className: "mt-4 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50", children: action })
] });
var ProfileField = ({ label, value }) => /* @__PURE__ */ jsxs19("div", { className: "rounded-2xl bg-slate-50 p-4", children: [
  /* @__PURE__ */ jsx25("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400", children: label }),
  /* @__PURE__ */ jsx25("p", { className: "mt-2 font-black text-slate-800", children: value })
] });

// src/components/ClientAccessScreen.tsx
import { useState as useState8 } from "react";
import { AlertCircle, ArrowRight as ArrowRight5, CheckCircle2 as CheckCircle23, KeyRound as KeyRound2, Loader2, ShieldCheck as ShieldCheck4 } from "lucide-react";

// src/lib/accessKey.ts
var ACCESS_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var ACCESS_KEY_PREFIX = "CRX";
var ACCESS_KEY_GROUP_LENGTH = 3;
var ACCESS_KEY_GROUPS = 3;
var ACCESS_KEY_CODE_LENGTH = 3;
var ACCESS_KEY_BODY_LENGTH = ACCESS_KEY_GROUP_LENGTH * (ACCESS_KEY_GROUPS - 1) + ACCESS_KEY_CODE_LENGTH;
var ACCESS_KEY_MAX_TYPED_LENGTH = 32;
var ACCESS_KEY_PLACEHOLDER = "CRX-___-___-ABC";
var AMBIGUOUS = ["0", "O", "1", "I"];
var stripPrefix = (compact) => compact.length > ACCESS_KEY_BODY_LENGTH && compact.startsWith(ACCESS_KEY_PREFIX) ? compact.slice(ACCESS_KEY_PREFIX.length) : compact;
var splitAccessKey = (raw) => {
  const compact = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = stripPrefix(compact);
  const groups = [];
  for (let index = 0; index < ACCESS_KEY_GROUPS; index += 1) {
    groups.push(body.slice(index * ACCESS_KEY_GROUP_LENGTH, (index + 1) * ACCESS_KEY_GROUP_LENGTH));
  }
  return groups;
};
var joinAccessKey = (groups) => groups.join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ACCESS_KEY_BODY_LENGTH);
var formatAccessKey = (raw) => {
  const upper = String(raw ?? "").toUpperCase();
  const ignored = [];
  let compact = "";
  for (const character of upper) {
    if (ACCESS_KEY_ALPHABET.includes(character)) {
      compact += character;
      continue;
    }
    if (/[A-Z0-9]/.test(character) && !ignored.includes(character)) ignored.push(character);
  }
  const body = stripPrefix(compact).slice(0, ACCESS_KEY_MAX_TYPED_LENGTH);
  const groups = [];
  for (let index = 0; index < body.length; index += ACCESS_KEY_GROUP_LENGTH) {
    groups.push(body.slice(index, index + ACCESS_KEY_GROUP_LENGTH));
  }
  return {
    display: groups.length ? `${ACCESS_KEY_PREFIX}-${groups.join("-")}` : "",
    body,
    groups: splitAccessKey(body),
    ignored: ignored.sort(),
    complete: body.length === ACCESS_KEY_BODY_LENGTH
  };
};
var EMPTY_PROBLEM = "Enter the project access key Code Rx Society gave you.";
var SHORT_PROBLEM = `An access key is ${ACCESS_KEY_BODY_LENGTH} characters \u2014 ${ACCESS_KEY_GROUPS} boxes of ${ACCESS_KEY_GROUP_LENGTH}. Check it and try again.`;
var LONG_PROBLEM = `An access key is ${ACCESS_KEY_BODY_LENGTH} characters. Check the key and try again.`;
var CODE_PROBLEM = "The last group is the project code \u2014 three letters, like MSD.";
var validateAccessKeyGroups = (boxes) => {
  const groups = boxes.map((value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const body = joinAccessKey(groups);
  if (!body) return { ok: false, body: "", problem: EMPTY_PROBLEM };
  if (body.length < ACCESS_KEY_BODY_LENGTH) return { ok: false, body, problem: SHORT_PROBLEM };
  const ambiguous = groups.join("").split("").filter((character) => AMBIGUOUS.includes(character));
  if (ambiguous.length) {
    return { ok: false, body, problem: `Access keys never contain ${[...new Set(ambiguous)].join(", ")} \u2014 check the key and try again.` };
  }
  const code = groups[ACCESS_KEY_GROUPS - 1] || "";
  if (code.length < ACCESS_KEY_CODE_LENGTH || /\d/.test(code)) {
    return { ok: false, body, problem: CODE_PROBLEM };
  }
  return { ok: true, body, problem: null };
};
var validateAccessKey = (raw) => {
  const formatted = formatAccessKey(raw);
  if (!formatted.body) return { ok: false, body: "", problem: EMPTY_PROBLEM };
  if (formatted.body.length < ACCESS_KEY_BODY_LENGTH) return { ok: false, body: formatted.body, problem: SHORT_PROBLEM };
  if (formatted.body.length > ACCESS_KEY_BODY_LENGTH) return { ok: false, body: formatted.body, problem: LONG_PROBLEM };
  if (formatted.ignored.length) {
    return {
      ok: false,
      body: formatted.body,
      problem: `Access keys never contain ${formatted.ignored.join(", ")} \u2014 check the key and try again.`
    };
  }
  if (!formatted.complete) return { ok: false, body: formatted.body, problem: LONG_PROBLEM };
  return { ok: true, body: formatted.body, problem: null };
};
var AMBIGUOUS_HINT = `Access keys never contain ${AMBIGUOUS.join(", ")}.`;
var FAILURE_MESSAGES = {
  invalid_key: "This project access key was not recognised. Check the key and try again.",
  key_expired: "This project access key has expired. Please contact Code Rx Society for a new one.",
  key_revoked: "This project access key has been revoked. Please contact Code Rx Society if you still need access.",
  client_suspended: "Access for this client is currently suspended. Please contact Code Rx Society.",
  client_archived: "This client account has been archived, so access is closed.",
  client_revoked: "Access for this client has been withdrawn. Please contact Code Rx Society.",
  project_unavailable: "The project linked to this access key is not available at the moment.",
  no_project: "This access key is not linked to a project yet. Please contact Code Rx Society.",
  link_invalid: "This access link was not recognised. Please ask Code Rx Society for a new one.",
  link_expired: "This access link has expired. Please ask Code Rx Society for a new one.",
  link_revoked: "This access link has been revoked. Please ask Code Rx Society for a new one.",
  link_exhausted: "This access link has already been used the maximum number of times.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  session_expired: "Your secure session has ended. Enter your access key to continue.",
  unavailable: "Client access is not available right now. Please try again shortly.",
  offline: "We could not reach Code Rx Society. Check your connection and try again.",
  server_error: "Something went wrong on our side. Please try again shortly."
};
var messageForFailure = (status, code) => {
  if (code && FAILURE_MESSAGES[code]) return FAILURE_MESSAGES[code];
  if (status === 0) return FAILURE_MESSAGES.offline;
  if (status === 429) return FAILURE_MESSAGES.rate_limited;
  if (status >= 500) return FAILURE_MESSAGES.server_error;
  return FAILURE_MESSAGES.unavailable;
};

// src/components/ClientSupportContact.tsx
import { Mail as Mail3, Send as Send4, UserRound as UserRound2 } from "lucide-react";
import { jsx as jsx26, jsxs as jsxs20 } from "react/jsx-runtime";
var ClientSupportContact = ({
  contact,
  /** The mail link for this screen, already carrying the context in its subject. */
  mailtoHref,
  /** One line of context shown under the heading. */
  message = "We will help you get back into your project.",
  /** Heading override; the default matches the client screens. */
  heading = "Need assistance?",
  /** Wording of the mail chip. */
  actionLabel = "Contact Code Rx",
  /** Override the PHANTOM channel (tests use this); defaults to the website form. */
  phantomHref = phantomContactHref()
}) => /* @__PURE__ */ jsxs20("div", { className: "rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4 text-center", children: [
  /* @__PURE__ */ jsx26("p", { className: "text-sm font-semibold text-slate-700", children: heading }),
  /* @__PURE__ */ jsx26("p", { className: "mt-1 text-xs font-medium leading-5 text-slate-500", children: message }),
  /* @__PURE__ */ jsxs20("div", { className: "mt-3.5 flex flex-wrap items-center justify-center gap-2", children: [
    /* @__PURE__ */ jsxs20(
      "a",
      {
        href: mailtoHref,
        className: "inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100",
        children: [
          /* @__PURE__ */ jsx26(Mail3, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
          actionLabel
        ]
      }
    ),
    /* @__PURE__ */ jsxs20(
      "a",
      {
        href: phantomHref,
        className: "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-100",
        children: [
          /* @__PURE__ */ jsx26(UserRound2, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
          "Talk to PHANTOM"
        ]
      }
    ),
    contact.telegram ? /* @__PURE__ */ jsxs20(
      "a",
      {
        href: contact.telegram,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100",
        children: [
          /* @__PURE__ */ jsx26(Send4, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
          "Telegram"
        ]
      }
    ) : null
  ] })
] });

// src/components/ClientAccessKeyField.tsx
import { useEffect as useEffect8, useRef as useRef7 } from "react";
import { jsx as jsx27, jsxs as jsxs21 } from "react/jsx-runtime";
var ClientAccessKeyField = ({
  boxes,
  onChange,
  onPasteKey,
  disabled = false,
  invalid = false,
  complete = false,
  describedBy,
  autoFocus = false
}) => {
  const refs = useRef7([]);
  useEffect8(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);
  const focusBox = (index, atEnd = true) => {
    const input = refs.current[index];
    if (!input) return;
    input.focus();
    if (atEnd) {
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
      }
    }
  };
  const writeBoxes = (next, focusIndex) => {
    onChange(next);
    if (focusIndex !== void 0) focusBox(focusIndex);
  };
  const handleInput = (index, raw) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const next = [...boxes];
    next[index] = cleaned.slice(0, ACCESS_KEY_GROUP_LENGTH);
    let overflow = cleaned.slice(ACCESS_KEY_GROUP_LENGTH);
    let cursor = index;
    while (overflow.length > 0 && cursor < ACCESS_KEY_GROUPS - 1) {
      cursor += 1;
      const combined = (next[cursor] || "") + overflow;
      next[cursor] = combined.slice(0, ACCESS_KEY_GROUP_LENGTH);
      overflow = combined.slice(ACCESS_KEY_GROUP_LENGTH);
    }
    const advance = next[index].length === ACCESS_KEY_GROUP_LENGTH && index < ACCESS_KEY_GROUPS - 1;
    onChange(next);
    if (advance) focusBox(index + 1);
  };
  const handleKeyDown = (event, index) => {
    const input = event.currentTarget;
    if (event.key === "Backspace" && !input.value && index > 0) {
      event.preventDefault();
      const next = [...boxes];
      next[index - 1] = next[index - 1].slice(0, -1);
      writeBoxes(next, index - 1);
      return;
    }
    if (event.key === "ArrowLeft" && (input.selectionStart ?? 0) === 0 && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight" && (input.selectionStart ?? 0) >= input.value.length && index < ACCESS_KEY_GROUPS - 1) {
      event.preventDefault();
      focusBox(index + 1);
    }
  };
  const handlePaste = (event) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.trim() || !onPasteKey) return;
    event.preventDefault();
    onPasteKey(text);
  };
  return /* @__PURE__ */ jsxs21("div", { className: "flex items-stretch justify-center gap-1.5 sm:gap-2", children: [
    /* @__PURE__ */ jsx27(
      "span",
      {
        "aria-hidden": "true",
        className: "grid shrink-0 place-items-center rounded-xl border-2 border-slate-200 bg-slate-100 px-2.5 font-mono text-base font-bold tracking-[0.05em] text-slate-500 sm:px-3.5 sm:text-xl",
        children: ACCESS_KEY_PREFIX
      }
    ),
    Array.from({ length: ACCESS_KEY_GROUPS }, (_, index) => {
      const isCode = index === ACCESS_KEY_GROUPS - 1;
      const filled = (boxes[index] || "").length === ACCESS_KEY_GROUP_LENGTH;
      return /* @__PURE__ */ jsx27(
        "input",
        {
          ref: (node) => {
            refs.current[index] = node;
          },
          value: boxes[index] || "",
          onChange: (event) => handleInput(index, event.target.value),
          onKeyDown: (event) => handleKeyDown(event, index),
          onPaste: handlePaste,
          onFocus: (event) => {
            const end = event.currentTarget.value.length;
            try {
              event.currentTarget.setSelectionRange(end, end);
            } catch {
            }
          },
          disabled,
          maxLength: ACCESS_KEY_GROUP_LENGTH,
          inputMode: "text",
          enterKeyHint: index === ACCESS_KEY_GROUPS - 1 ? "go" : "next",
          autoComplete: "off",
          autoCorrect: "off",
          autoCapitalize: "characters",
          spellCheck: false,
          "aria-label": isCode ? `Project code, group ${index + 1} of ${ACCESS_KEY_GROUPS}, ${ACCESS_KEY_CODE_LENGTH} letters` : `Access key, group ${index + 1} of ${ACCESS_KEY_GROUPS}`,
          "aria-invalid": invalid,
          "aria-describedby": describedBy,
          className: `w-full min-w-0 rounded-xl border-2 bg-slate-50 py-4 text-center font-mono text-lg font-bold uppercase tracking-[0.14em] text-slate-900 shadow-inner outline-none transition placeholder:text-slate-300 disabled:opacity-60 sm:text-xl ${invalid ? "border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:bg-white" : complete && filled ? "border-emerald-300 bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50" : "border-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50"}`
        },
        index
      );
    })
  ] });
};

// src/components/ClientSiteSign.tsx
import { ArrowLeft as ArrowLeft3 } from "lucide-react";
import { jsx as jsx28, jsxs as jsxs22 } from "react/jsx-runtime";
var ClientSiteSign = ({
  subtitle = "Client Project Portal",
  /** Show the small text sign beside the lockup. */
  withBackSign = true
}) => /* @__PURE__ */ jsxs22("div", { className: "flex min-w-0 items-center gap-3", children: [
  /* @__PURE__ */ jsxs22(
    "a",
    {
      href: CLIENT_SITE_HOME,
      "aria-label": "Code Rx Society website home",
      className: "flex min-w-0 items-center gap-3 rounded-lg no-underline focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100",
      children: [
        /* @__PURE__ */ jsx28("img", { src: "/logo.png", alt: "Code Rx Society", className: "h-9 w-9 rounded-lg object-contain" }),
        /* @__PURE__ */ jsxs22("span", { className: "min-w-0 leading-tight", children: [
          /* @__PURE__ */ jsx28("span", { className: "block text-[12px] font-black tracking-[0.22em] text-slate-900 sm:text-[13px]", children: "CODE Rx SOCIETY" }),
          /* @__PURE__ */ jsx28("span", { className: "block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500", children: subtitle })
        ] })
      ]
    }
  ),
  withBackSign ? /* @__PURE__ */ jsxs22(
    "a",
    {
      href: CLIENT_SITE_HOME,
      className: "ml-1 hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 sm:inline-flex",
      children: [
        /* @__PURE__ */ jsx28(ArrowLeft3, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
        "Back to website"
      ]
    }
  ) : null
] });

// src/components/ClientAccessScreen.tsx
import { Fragment as Fragment12, jsx as jsx29, jsxs as jsxs23 } from "react/jsx-runtime";
var ClientAccessScreen = ({
  onSubmit,
  notice,
  eyebrow,
  heading,
  helper,
  noticeIcon,
  onAbandon,
  abandonLabel,
  contact
}) => {
  const [boxes, setBoxes] = useState8(["", "", ""]);
  const [error, setError] = useState8(null);
  const [submitting, setSubmitting] = useState8(false);
  const [noticeDismissed, setNoticeDismissed] = useState8(false);
  const shownError = error ?? (noticeDismissed ? null : notice ?? null);
  const details = contact ?? clientContact(null);
  const body = joinAccessKey(boxes);
  const validation = validateAccessKeyGroups(boxes);
  const filled = Math.min(body.length, ACCESS_KEY_BODY_LENGTH);
  const complete = filled === ACCESS_KEY_BODY_LENGTH;
  const clearFeedback = () => {
    if (error) setError(null);
    if (notice) setNoticeDismissed(true);
  };
  const submitBody = async (candidate) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNoticeDismissed(true);
    try {
      await onSubmit(candidate);
      setBoxes(["", "", ""]);
    } catch (failure) {
      const status = failure instanceof ClientPortalError ? failure.status : -1;
      const code = failure instanceof ClientPortalError ? failure.code : null;
      setError(messageForFailure(status, code));
    } finally {
      setSubmitting(false);
    }
  };
  const handleBoxes = (next) => {
    setBoxes(next);
    clearFeedback();
    const candidate = validateAccessKeyGroups(next);
    if (validateAccessKey(joinAccessKey(next)).ok && candidate.ok) void submitBody(candidate.body);
  };
  const handlePaste = (text) => {
    const groups = splitAccessKey(text);
    if (!groups.join("")) return;
    setBoxes(groups);
    clearFeedback();
    if (validateAccessKey(text).ok) void submitBody(joinAccessKey(groups));
    else setError(validateAccessKeyGroups(groups).problem);
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validation.ok) {
      setError(validation.problem);
      return;
    }
    void submitBody(validation.body);
  };
  const hint = shownError ? null : complete ? "Looks complete \u2014 verifying now." : filled ? `${filled} of ${ACCESS_KEY_BODY_LENGTH} characters \u2014 ${ACCESS_KEY_GROUPS} boxes, then the project code.` : null;
  const describedBy = shownError ? "client-access-error" : hint ? "client-access-hint" : void 0;
  return /* @__PURE__ */ jsxs23("div", { className: "min-h-screen bg-slate-50", children: [
    /* @__PURE__ */ jsx29("header", { className: "border-b border-slate-200 bg-white", children: /* @__PURE__ */ jsxs23("div", { className: "mx-auto flex h-16 max-w-5xl items-center justify-between px-5", children: [
      /* @__PURE__ */ jsx29(ClientSiteSign, {}),
      /* @__PURE__ */ jsxs23("span", { className: "hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 sm:inline-flex", children: [
        /* @__PURE__ */ jsx29(ShieldCheck4, { className: "h-4 w-4" }),
        " Secure client access"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs23("main", { className: "mx-auto flex w-full max-w-xl flex-col items-center px-5 py-14 sm:py-20", children: [
      /* @__PURE__ */ jsxs23("div", { className: "w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] sm:p-10", children: [
        /* @__PURE__ */ jsxs23("div", { className: "flex flex-col items-center text-center", children: [
          /* @__PURE__ */ jsx29("span", { className: "inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100", children: /* @__PURE__ */ jsx29(KeyRound2, { className: "h-6 w-6" }) }),
          /* @__PURE__ */ jsx29("p", { className: "mt-5 text-[11px] font-black uppercase tracking-[0.32em] text-emerald-700", children: eyebrow || "CODE Rx SOCIETY" }),
          /* @__PURE__ */ jsx29("h1", { className: "mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl", children: heading || "CLIENT ACCESS" }),
          /* @__PURE__ */ jsx29("p", { className: "mt-3 text-sm font-medium text-slate-600", children: helper || "Enter your project access key" })
        ] }),
        /* @__PURE__ */ jsxs23("form", { onSubmit: handleSubmit, className: "mt-8", noValidate: true, "aria-busy": submitting, children: [
          /* @__PURE__ */ jsx29("p", { id: "client-access-key-label", className: "sr-only", children: "Project access key" }),
          /* @__PURE__ */ jsx29(
            ClientAccessKeyField,
            {
              boxes,
              onChange: handleBoxes,
              onPasteKey: handlePaste,
              disabled: submitting,
              invalid: Boolean(shownError),
              complete,
              describedBy,
              autoFocus: true
            }
          ),
          /* @__PURE__ */ jsx29("div", { className: "mt-3 flex items-center gap-2", "aria-hidden": "true", children: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((slot) => /* @__PURE__ */ jsx29(
            "span",
            {
              className: `h-1.5 flex-1 rounded-full transition-colors ${slot < 6 ? slot < Math.min(filled, 6) ? "bg-emerald-500" : "bg-slate-200" : filled >= 9 ? "bg-emerald-500" : filled > slot ? "bg-emerald-200" : "bg-slate-200"}`
            },
            slot
          )) }),
          /* @__PURE__ */ jsx29("p", { className: "mt-2 text-center text-[11px] font-semibold tracking-wide text-slate-500", children: ACCESS_KEY_PLACEHOLDER }),
          /* @__PURE__ */ jsxs23("div", { className: "flex min-h-[46px] items-start justify-between gap-3 pt-3", children: [
            /* @__PURE__ */ jsx29("div", { className: "min-w-0 flex-1", children: shownError ? /* @__PURE__ */ jsxs23("p", { id: "client-access-error", role: "alert", className: "flex items-start gap-2 text-sm font-semibold text-rose-700", children: [
              /* @__PURE__ */ jsx29(AlertCircle, { className: "mt-0.5 h-4 w-4 shrink-0" }),
              /* @__PURE__ */ jsx29("span", { children: shownError })
            ] }) : notice && !noticeDismissed && noticeIcon ? /* @__PURE__ */ jsxs23("p", { className: "flex items-start gap-2 text-sm font-semibold text-slate-600", children: [
              noticeIcon,
              /* @__PURE__ */ jsx29("span", { children: notice })
            ] }) : hint ? /* @__PURE__ */ jsxs23(
              "p",
              {
                id: "client-access-hint",
                className: `flex items-start gap-2 text-sm font-medium ${complete ? "text-emerald-700" : "text-slate-500"}`,
                children: [
                  complete ? /* @__PURE__ */ jsx29(CheckCircle23, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": "true" }) : null,
                  /* @__PURE__ */ jsx29("span", { children: complete && submitting ? "Verifying access key\u2026" : hint })
                ]
              }
            ) : null }),
            filled && !complete ? /* @__PURE__ */ jsxs23("span", { className: "shrink-0 pt-0.5 font-mono text-[11px] font-bold text-slate-500", "aria-hidden": "true", children: [
              filled,
              "/",
              ACCESS_KEY_BODY_LENGTH
            ] }) : null
          ] }),
          /* @__PURE__ */ jsx29(
            "button",
            {
              type: "submit",
              disabled: submitting,
              className: "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-emerald-600/70",
              children: submitting ? /* @__PURE__ */ jsxs23(Fragment12, { children: [
                /* @__PURE__ */ jsx29(Loader2, { className: "h-4 w-4 animate-spin" }),
                " Verifying access key\u2026"
              ] }) : /* @__PURE__ */ jsxs23(Fragment12, { children: [
                "Enter Project ",
                /* @__PURE__ */ jsx29(ArrowRight5, { className: "h-4 w-4" })
              ] })
            }
          )
        ] }),
        onAbandon ? /* @__PURE__ */ jsx29("div", { className: "mt-5 text-center", children: /* @__PURE__ */ jsx29(
          "button",
          {
            type: "button",
            onClick: onAbandon,
            className: "text-xs font-black uppercase tracking-[0.14em] text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline",
            children: abandonLabel || "Continue without this link"
          }
        ) }) : null,
        /* @__PURE__ */ jsx29("div", { className: "mt-8 border-t border-slate-100 pt-6", children: /* @__PURE__ */ jsx29(
          ClientSupportContact,
          {
            contact: details,
            mailtoHref: clientSupportMailto(details.email, "Client portal access")
          }
        ) })
      ] }),
      /* @__PURE__ */ jsx29("p", { className: "mt-6 max-w-md text-center text-xs font-medium leading-5 text-slate-500", children: "Your access key is verified on Code Rx servers. Only your published project documents are shown here." })
    ] })
  ] });
};

// .audit-entry.tsx
import { jsx as jsx30 } from "react/jsx-runtime";
var render = (element) => renderToStaticMarkup(element);
var pages = () => ({
  home: render(/* @__PURE__ */ jsx30(SiteFlow, { siteContent: INITIAL_SITE_CONTENT, activeTab: "home", onJoin: () => void 0, includeFooter: true, includeJoinCta: true })),
  contact: render(/* @__PURE__ */ jsx30(ContactForm, { isOpen: true, onClose: () => void 0 })),
  dashboard: render(/* @__PURE__ */ jsx30(Dashboard, { user: { id: 1, displayName: "Ada", email: "a@b.test", codename: "Calcitonin" } })),
  clientAccess: render(/* @__PURE__ */ jsx30(ClientAccessScreen, { onSubmit: async () => void 0 })),
  clientSupport: render(/* @__PURE__ */ jsx30(ClientSupportContact, { contact: { email: "coderxsociety@gmail.com", telegram: "https://t.me/x" }, links: void 0 }))
});
var renderOne = () => {
  const out = {};
  const attempt = (name, element) => {
    try {
      out[name] = render(element);
    } catch (error) {
      out[name] = "";
      console.log(`  [${name}] render failed: ${error.message}`);
    }
  };
  attempt("home", /* @__PURE__ */ jsx30(SiteFlow, { siteContent: INITIAL_SITE_CONTENT, activeTab: "home", onJoin: () => void 0, includeFooter: true, includeJoinCta: true }));
  attempt("contact", /* @__PURE__ */ jsx30(ContactForm, { isOpen: true, onClose: () => void 0 }));
  attempt("clientAccess", /* @__PURE__ */ jsx30(ClientAccessScreen, { onSubmit: async () => void 0 }));
  attempt("clientSupport", /* @__PURE__ */ jsx30(ClientSupportContact, { contact: { email: "coderxsociety@gmail.com", telegram: "https://t.me/x" }, links: void 0 }));
  return out;
};
export {
  pages,
  renderOne
};
