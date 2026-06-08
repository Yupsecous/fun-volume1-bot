// pm2 process config for the fun-volume-bot.
// Runs the TypeScript entrypoint via ts-node (transpile-only for fast, robust startup).
// pm2 handles auto-restart on crash, so we use plain ts-node (not the ts-node-dev watcher).
module.exports = {
  apps: [
    {
      name: 'fun-volume-bot',
      cwd: 'd:/Solana/fun-volume-bot-main/fun-volume-bot-main/bot',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      env: {
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_PROJECT: 'tsconfig.json',
      },
      autorestart: true,
      restart_delay: 3000,   // wait 3s before restarting after a crash
      min_uptime: 10000,     // must stay up 10s to count as a successful start
      max_restarts: 50,      // give up after 50 rapid restarts (crash loop guard)
      max_memory_restart: '700M',
      time: true,            // prefix log lines with timestamps
      out_file: 'd:/Solana/fun-volume-bot-main/fun-volume-bot-main/bot/logs/out.log',
      error_file: 'd:/Solana/fun-volume-bot-main/fun-volume-bot-main/bot/logs/error.log',
      merge_logs: true,
    },
  ],
}
