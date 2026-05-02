export function createLogger(scope) {
  function write(level, message, meta) {
    const payload = {
      time: new Date().toISOString(),
      level,
      scope,
      message,
      ...(meta ? { meta } : {})
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  };
}
