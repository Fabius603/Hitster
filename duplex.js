/* Shared by the print view and Node tests. Slots include blanks on partial sheets. */
(function (root) {
  function planSheets(cards, edge = 'long') {
    const sheets = [];
    for (let offset = 0; offset < cards.length; offset += 8) {
      const front = Array.from({ length: 8 }, (_, i) => cards[offset + i] || null);
      const back = Array.from({ length: 8 }, (_, i) => {
        const row = Math.floor(i / 2), column = i % 2;
        return front[edge === 'short' ? (3 - row) * 2 + column : row * 2 + (1 - column)];
      });
      sheets.push({ front, back });
    }
    return sheets;
  }
  if (typeof module !== 'undefined') module.exports = { planSheets };
  else root.planSheets = planSheets;
})(globalThis);
