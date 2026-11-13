/* Shared by the print view and Node tests. Slots include blanks on partial sheets. */
(function (root) {
  const columns = 2, rows = 3, perSheet = columns * rows;
  function planSheets(cards, edge = 'long') {
    const sheets = [];
    for (let offset = 0; offset < cards.length; offset += perSheet) {
      const front = Array.from({ length: perSheet }, (_, i) => cards[offset + i] || null);
      const back = Array.from({ length: perSheet }, (_, i) => {
        const row = Math.floor(i / columns), column = i % columns;
        return front[edge === 'short' ? (rows - 1 - row) * columns + column : row * columns + (columns - 1 - column)];
      });
      sheets.push({ front, back });
    }
    return sheets;
  }
  if (typeof module !== 'undefined') module.exports = { planSheets };
  else root.planSheets = planSheets;
})(globalThis);
