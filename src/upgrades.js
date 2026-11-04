const PORT_DEFAULTS = { port: 8420 };

function toPort(value, fallback) {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/**
 * The port was a text field checked by Regex.PORT, which base 2.2.2
 * deprecated; it is a number field now. A saved config still holds it as a
 * string, so convert it, falling back to the default for anything that is not
 * a port.
 */
export function portsToNumbers(_context, props) {
  const config = props.config;
  let updatedConfig = null;
  if (config) {
    for (const [key, fallback] of Object.entries(PORT_DEFAULTS)) {
      const port = toPort(config[key], fallback);
      if (port !== config[key]) {
        updatedConfig ??= { ...config };
        updatedConfig[key] = port;
      }
    }
  }
  return { updatedConfig, updatedActions: [], updatedFeedbacks: [] };
}

export const UpgradeScripts = [
  /*
   * Place upgrade scripts here as the module evolves.
   * Remember: once published, an upgrade script cannot be removed.
   */
  portsToNumbers,
];
