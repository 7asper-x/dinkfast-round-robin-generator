export type Player = { id: string; name: string };
export type Team = [Player, Player];
export type Match = {
  id: string;
  round: number;
  court: number;
  teamA: Team;
  teamB: Team;
};

type PartnerCounts = Record<string, Record<string, number>>;
type OpponentCounts = Record<string, Record<string, number>>;

export const toPlayers = (names: string[]): Player[] =>
  names.map((name, index) => ({ id: `${index}-${name}`, name }));

const getKey = (players: Player[]) =>
  players
    .map((p) => p.id)
    .sort()
    .join("_");

const incrementCount = (
  map: PartnerCounts | OpponentCounts,
  a: Player,
  b: Player
) => {
  if (!map[a.id]) map[a.id] = {};
  map[a.id][b.id] = (map[a.id][b.id] || 0) + 1;
};

const getCount = (map: PartnerCounts | OpponentCounts, a: Player, b: Player) =>
  map[a.id]?.[b.id] || 0;

const generateAllTeams = (players: Player[]) => {
  const filtered = players.filter((p) => p.name !== "Bye");
  const teams: Team[] = [];
  for (let i = 0; i < filtered.length; i += 1) {
    for (let j = i + 1; j < filtered.length; j += 1) {
      teams.push([filtered[i], filtered[j]]);
    }
  }
  return teams;
};

const scoreMatch = (
  teamA: Team,
  teamB: Team,
  partnerCounts: PartnerCounts,
  opponentCounts: OpponentCounts,
  playCounts: Record<string, number>
) => {
  const partnerPenalty =
    getCount(partnerCounts, teamA[0], teamA[1]) +
    getCount(partnerCounts, teamA[1], teamA[0]) +
    getCount(partnerCounts, teamB[0], teamB[1]) +
    getCount(partnerCounts, teamB[1], teamB[0]);

  const opponentPenalty =
    getCount(opponentCounts, teamA[0], teamB[0]) +
    getCount(opponentCounts, teamA[0], teamB[1]) +
    getCount(opponentCounts, teamA[1], teamB[0]) +
    getCount(opponentCounts, teamA[1], teamB[1]) +
    getCount(opponentCounts, teamB[0], teamA[0]) +
    getCount(opponentCounts, teamB[0], teamA[1]) +
    getCount(opponentCounts, teamB[1], teamA[0]) +
    getCount(opponentCounts, teamB[1], teamA[1]);

  const sitBalancePenalty =
    (playCounts[teamA[0].id] || 0) +
    (playCounts[teamA[1].id] || 0) +
    (playCounts[teamB[0].id] || 0) +
    (playCounts[teamB[1].id] || 0);

  return partnerPenalty * 5 + opponentPenalty * 3 + sitBalancePenalty;
};

const pickRoundMatches = (
  teams: Team[],
  partnerCounts: PartnerCounts,
  opponentCounts: OpponentCounts,
  playCounts: Record<string, number>,
  courtCount: number
): Team[][] => {
  if (courtCount === 0) return [];

  const candidates: { match: Team[]; score: number }[] = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const teamA = teams[i];
      const teamB = teams[j];
      const ids = new Set([teamA[0].id, teamA[1].id, teamB[0].id, teamB[1].id]);
      if (ids.size !== 4) continue;
      const score = scoreMatch(
        teamA,
        teamB,
        partnerCounts,
        opponentCounts,
        playCounts
      );
      candidates.push({ match: [teamA, teamB], score });
    }
  }

  candidates.sort(
    (a, b) =>
      a.score - b.score ||
      getKey(a.match.flat()).localeCompare(getKey(b.match.flat()))
  );

  const best: Team[][] = [];
  const used = new Set<string>();
  for (const candidate of candidates) {
    if (best.length >= courtCount) break;
    const ids = candidate.match.flat().map((p) => p.id);
    const conflict = ids.some((id) => used.has(id));
    if (conflict) continue;
    candidate.match.flat().forEach((p) => used.add(p.id));
    best.push(candidate.match);
  }

  return best;
};

const computeTargetRounds = (playerCount: number, courtCount: number) => {
  const base = Math.max(playerCount - 1, 1);
  const buffer = Math.ceil(
    Math.max(0, playerCount - 4) / Math.max(courtCount, 1)
  );
  return Math.min(base + buffer, 50);
};

export const generateSchedule = (
  players: Player[],
  courtCount: number
): Match[] => {
  if (players.length < 4) return [];

  const totalRoundsRequested = computeTargetRounds(players.length, courtCount);
  const teams = generateAllTeams(players);
  if (teams.length === 0) return [];

  const partnerCounts: PartnerCounts = {};
  const opponentCounts: OpponentCounts = {};
  const playCounts: Record<string, number> = {};
  const matches: Match[] = [];

  for (let round = 0; round < totalRoundsRequested; round += 1) {
    const roundMatches = pickRoundMatches(
      teams,
      partnerCounts,
      opponentCounts,
      playCounts,
      courtCount
    );

    if (roundMatches.length === 0) break;

    roundMatches.forEach((pair, index) => {
      const [teamA, teamB] = pair;
      teamA.forEach((player) => {
        playCounts[player.id] = (playCounts[player.id] || 0) + 1;
        incrementCount(
          partnerCounts,
          player,
          teamA[0] === player ? teamA[1] : teamA[0]
        );
        incrementCount(opponentCounts, player, teamB[0]);
        incrementCount(opponentCounts, player, teamB[1]);
      });
      teamB.forEach((player) => {
        playCounts[player.id] = (playCounts[player.id] || 0) + 1;
        incrementCount(
          partnerCounts,
          player,
          teamB[0] === player ? teamB[1] : teamB[0]
        );
        incrementCount(opponentCounts, player, teamA[0]);
        incrementCount(opponentCounts, player, teamA[1]);
      });

      matches.push({
        id: `${round + 1}-${index}`,
        round: round + 1,
        court: index + 1,
        teamA,
        teamB,
      });
    });
  }

  return matches;
};

