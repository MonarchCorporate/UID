/**
 * Discord/RSI verification switch.
 *
 * DISCORD_VERIFICATION=on|off controls it explicitly. Without the variable,
 * verification is OFF whenever the beta test login is enabled (BETA_LOGIN=on),
 * so beta.uid.sc can be tested without Discord, and ON everywhere else
 * (production behaviour unchanged).
 */
export function discordVerificationEnabled(): boolean {
  const v = (process.env.DISCORD_VERIFICATION ?? "").trim().toLowerCase();
  if (v === "on" || v === "true" || v === "1") return true;
  if (v === "off" || v === "false" || v === "0") return false;
  return (process.env.BETA_LOGIN ?? "").trim().toLowerCase() !== "on";
}
