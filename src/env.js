// This file is loaded FIRST via --import flag before any other module.
// It ensures .env is loaded into process.env before any import side-effects run.
import dotenv from 'dotenv';
dotenv.config({ override: true });
