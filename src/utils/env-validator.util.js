export function validateEnv() {
  if (!process.env.MONGODB_URI) {
    console.warn("WARNING: MONGODB_URI environment variable is missing!");
  }
}
