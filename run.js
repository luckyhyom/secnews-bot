#!/usr/bin/env node
import 'dotenv/config';
import { runPipeline } from './src/pipeline.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const provider = args.find((a) => a.startsWith('--provider='))?.split('=')[1];
const model = args.find((a) => a.startsWith('--model='))?.split('=')[1];

runPipeline({
  dryRun,
  llm: { type: provider, model },
}).catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
