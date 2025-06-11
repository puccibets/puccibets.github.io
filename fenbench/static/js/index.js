function toggleSettings() {
  const settingsInfo = document.getElementById('settingsInfo');
  if (settingsInfo.style.display === 'none' || settingsInfo.style.display === '') {
    settingsInfo.style.display = 'block';
  } else {
    settingsInfo.style.display = 'none';
  }
}

function populateLeaderboard() {
  const data = [
    {rank: '1st', model: 'Stockfish 16', score: '3500', organization: 'Open Source'},
    {rank: '2nd', model: 'Lc0', score: '3400', organization: 'Open Source'},
    {rank: '3rd', model: 'Komodo', score: '3300', organization: 'Komodo Chess'},
  ];
  const table = document.getElementById('leaderboardTable');
  data.forEach(entry => {
    const row = table.insertRow();
    row.innerHTML = `
      <td class="rank">${entry.rank}</td>
      <td>${entry.model}</td>
      <td>${entry.score}</td>
      <td>${entry.organization}</td>
    `;
  });
}

document.addEventListener('DOMContentLoaded', populateLeaderboard);
