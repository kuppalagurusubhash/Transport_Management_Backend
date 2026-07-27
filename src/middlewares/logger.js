// ─── ANSI Color Codes ────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
  bgYellow:'\x1b[43m',
  bgBlue:  '\x1b[44m',
};

// ─── Method Colors ────────────────────────────────────────────────────────────
const methodColor = (method) => {
  switch (method) {
    case 'GET':    return `${c.bold}${c.green}`;
    case 'POST':   return `${c.bold}${c.blue}`;
    case 'PUT':    return `${c.bold}${c.yellow}`;
    case 'PATCH':  return `${c.bold}${c.magenta}`;
    case 'DELETE': return `${c.bold}${c.red}`;
    default:       return `${c.bold}${c.white}`;
  }
};

// ─── Status Code Colors ───────────────────────────────────────────────────────
const statusColor = (status) => {
  if (status >= 500) return `${c.bold}${c.red}`;
  if (status >= 400) return `${c.bold}${c.yellow}`;
  if (status >= 300) return `${c.bold}${c.cyan}`;
  if (status >= 200) return `${c.bold}${c.green}`;
  return c.white;
};

// ─── Timestamp ────────────────────────────────────────────────────────────────
const timestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-IN', { hour12: false });
};

// ─── Logger Middleware ────────────────────────────────────────────────────────
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const method   = req.method.padEnd(7);
    const status   = res.statusCode;
    const url      = req.originalUrl;
    const time     = timestamp();

    const mColor  = methodColor(req.method);
    const sColor  = statusColor(status);
    const dColor  = duration > 500 ? c.red : duration > 200 ? c.yellow : c.green;

    console.log(
      `${c.dim}[${time}]${c.reset} ` +
      `${mColor}${method}${c.reset} ` +
      `${c.white}${url.padEnd(45)}${c.reset} ` +
      `${sColor}${status}${c.reset} ` +
      `${c.dim}─${c.reset} ` +
      `${dColor}${duration}ms${c.reset}`
    );
  });

  next();
};

// ─── Startup Banner ───────────────────────────────────────────────────────────
export const printStartupBanner = (port) => {
  console.log('');
  console.log(`${c.cyan}${c.bold}┌─────────────────────────────────────────┐${c.reset}`);
  console.log(`${c.cyan}${c.bold}│   🚚  Transport Management Backend       │${c.reset}`);
  console.log(`${c.cyan}${c.bold}├─────────────────────────────────────────┤${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  HTTP  ${c.green}http://localhost:${port}${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  WS    ${c.green}ws://localhost:${port}${c.reset}`);
  console.log(`${c.cyan}│${c.reset}  ENV   ${c.yellow}${process.env.NODE_ENV || 'development'}${c.reset}`);
  console.log(`${c.cyan}${c.bold}└─────────────────────────────────────────┘${c.reset}`);
  console.log('');
};
