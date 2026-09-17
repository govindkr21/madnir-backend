const COLOR = { reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" };

const stamp = () => new Date().toISOString();

const log = (level, color, ...args) => {
  if (process.env.DEBUG === "OFF" && level === "debug") return;
  const prefix = `${COLOR.dim}${stamp()}${COLOR.reset} ${color}[${level.toUpperCase()}]${COLOR.reset}`;
  console.log(prefix, ...args);
};

module.exports = {
  info: (...a) => log("info", COLOR.cyan, ...a),
  warn: (...a) => log("warn", COLOR.yellow, ...a),
  error: (...a) => log("error", COLOR.red, ...a),
  debug: (...a) => log("debug", COLOR.dim, ...a),
};
