// Ticks once a second from a worker. Browsers slow timers in background tabs to as little
// as once a minute, but not in workers, so the focus timer still ends on time.
setInterval(() => postMessage("tick"), 1000);
