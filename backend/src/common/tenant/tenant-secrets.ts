// Pflicht-Secrets eines Mandanten (tenants/<slug>/.env, im Container /app/.env).
// tenant-init prueft sie vor dem ersten Backend-Start — ein fehlender oder
// kaputter Key faellt sonst erst beim ersten Login/Register auf
// (crypto.helper.ts wirft dann mitten im Request).
export function tenantSecretErrors(env: NodeJS.ProcessEnv = process.env): string[] {
    const errors: string[] = [];
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET fehlt oder ist kuerzer als 32 Zeichen');
    }
    if (!env.EMAIL_SALT || env.EMAIL_SALT.length < 16) {
        errors.push('EMAIL_SALT fehlt oder ist kuerzer als 16 Zeichen');
    }
    // AES-256 braucht genau 32 Byte = 64 Hex-Zeichen (crypto.helper.ts).
    if (!env.APP_ENCRYPTION_KEY || !/^[0-9a-f]{64}$/i.test(env.APP_ENCRYPTION_KEY)) {
        errors.push('APP_ENCRYPTION_KEY muss 64 Hex-Zeichen haben (32 Byte)');
    }
    return errors;
}
