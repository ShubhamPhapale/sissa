async function run() {
  for (let i = 0; i < 5; i++) {
    const ac = new AbortController();
    fetch(`http://localhost:3001/api/analysis/stream?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR+w+KQkq+-+0+1&depth=5`, { signal: ac.signal })
      .then(res => res.text()).catch(() => {});
    await new Promise(r => setTimeout(r, 100));
    ac.abort();
    console.log("Aborted", i);
  }
}
run();
