// Helper script for timeout tests: ignores all args and sleeps for 60 seconds.
// Usage: node sleep-bin.js --prompt "anything"
setTimeout(() => {
  process.stdout.write('done');
  process.exit(0);
}, 60000);
