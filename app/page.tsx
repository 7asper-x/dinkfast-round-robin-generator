"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shuffle, RotateCw, UsersRound, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

type Player = { id: string; name: string };
type Team = [Player, Player];
type Score = { teamA: number | null; teamB: number | null };
type Match = {
  id: string;
  round: number;
  court: number;
  teamA: Team;
  teamB: Team;
};

const formSchema = z.object({
  names: z
    .string()
    .min(1, "Enter player names (comma or line separated).")
    .refine((val) => {
      const parsed = parseNames(val);
      return parsed.length >= 4;
    }, "Add at least 4 players to build a rotation."),
  courts: z
    .number()
    .int()
    .min(1, "At least one court")
    .max(6, "Keep it under 6 courts"),
});

const parseNames = (value: string) =>
  value
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);

const ensureEvenPlayers = (players: string[]) =>
  players.length % 2 === 0 ? players : [...players, "Bye"];

const toPlayers = (names: string[]): Player[] =>
  names.map((name, index) => ({ id: `${index}-${name}`, name }));

type PartnerCounts = Record<string, Record<string, number>>;
type OpponentCounts = Record<string, Record<string, number>>;

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

const getCount = (
  map: PartnerCounts | OpponentCounts,
  a: Player,
  b: Player
) => map[a.id]?.[b.id] || 0;

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
      const ids = new Set([
        teamA[0].id,
        teamA[1].id,
        teamB[0].id,
        teamB[1].id,
      ]);
      if (ids.size !== 4) continue;
      const score = scoreMatch(teamA, teamB, partnerCounts, opponentCounts, playCounts);
      candidates.push({ match: [teamA, teamB], score });
    }
  }

  candidates.sort((a, b) => a.score - b.score || getKey(a.match.flat()) .localeCompare(getKey(b.match.flat())));

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
  const buffer = Math.ceil(Math.max(0, playerCount - 4) / Math.max(courtCount, 1));
  return Math.min(base + buffer, 50);
};

const generateSchedule = (players: Player[], courtCount: number): Match[] => {
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
        incrementCount(partnerCounts, player, teamA[0] === player ? teamA[1] : teamA[0]);
        incrementCount(opponentCounts, player, teamB[0]);
        incrementCount(opponentCounts, player, teamB[1]);
      });
      teamB.forEach((player) => {
        playCounts[player.id] = (playCounts[player.id] || 0) + 1;
        incrementCount(partnerCounts, player, teamB[0] === player ? teamB[1] : teamB[0]);
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

const defaultRoster = [
  "Alex",
  "Brooke",
  "Casey",
  "Drew",
  "Elliot",
  "Finley",
  "Gray",
  "Harper",
  "Indie",
  "Jules",
  "Kai",
  "Logan",
];

export default function Home() {
  const [scores, setScores] = useState<Record<string, Score>>({});
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { names: defaultRoster.join("\n"), courts: 2 },
  });

  const playerNames = ensureEvenPlayers(parseNames(form.watch("names")));
  const courtCount = Math.min(Math.max(form.watch("courts") || 2, 1), 6);
  const players = useMemo(() => toPlayers(playerNames), [playerNames]);
  const schedule = useMemo(
    () => generateSchedule(players, courtCount),
    [players, courtCount]
  );
  const matchesByRound = useMemo(() => {
    const grouped: Record<number, Match[]> = {};
    schedule.forEach((match) => {
      if (!grouped[match.round]) grouped[match.round] = [];
      grouped[match.round].push(match);
    });
    return grouped;
  }, [schedule]);

  const handleScoreChange = (
    matchId: string,
    side: keyof Score,
    value: string
  ) => {
    const numeric = value === "" ? null : Math.max(0, Number(value));
    setScores((prev) => ({
      ...prev,
      [matchId]: {
        teamA: side === "teamA" ? numeric : prev[matchId]?.teamA ?? null,
        teamB: side === "teamB" ? numeric : prev[matchId]?.teamB ?? null,
      },
    }));
  };

  const handleResetScores = () => setScores({});

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const parsed = parseNames(values.names);
    if (parsed.length < 4) {
      form.setError("names", {
        message: "Add at least 4 players to build a rotation.",
      });
      return;
    }
    form.clearErrors();
    setScores({});
    if (values.courts < 1 || values.courts > 6) {
      form.setError("courts", { message: "Courts should be between 1 and 6." });
    }
  };

  const totalRounds = Math.max(...schedule.map((m) => m.round), 0);

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white md:px-10 md:py-10 lg:px-16">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
            <Shuffle size={14} />
            Dinkfast
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              Pickleball round robin generator
            </h1>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <UsersRound size={18} />
              <span>
                Players: {players.length}
                {players.some((p) => p.name === "Bye") ? " (Bye added)" : ""}
              </span>
            </div>
          </div>
          <p className="max-w-3xl text-base text-slate-600 dark:text-slate-300">
            Paste your player list, generate balanced doubles rotations, and log
            scores. Everything stays on-device. Mobile-first, zero login.
          </p>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[2fr_1fr]"
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-1">
              <div className="flex flex-col gap-2">
                <Label htmlFor="courts">Courts in use</Label>
                <Controller
                  control={form.control}
                  name="courts"
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <Slider
                        id="courts"
                        min={1}
                        max={6}
                        value={[field.value || 1]}
                        onValueChange={(val) => field.onChange(val[0])}
                        aria-label="Number of courts"
                      />
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {field.value || 1}
                        </span>
                        <span>1 – 6</span>
                      </div>
                    </div>
                  )}
                />
                {form.formState.errors.courts && (
                  <p className="text-sm text-red-500" role="alert">
                    {form.formState.errors.courts.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="names">
                Players (comma or newline separated)
              </Label>
              <Badge variant="secondary" aria-label="minimum players indicator">
                Players: {players.length} (min 4)
              </Badge>
            </div>
            <Textarea
              id="names"
              aria-label="Player names input"
              placeholder="Ava, Ben, Chloe, Drew..."
              {...form.register("names")}
            />
            {form.formState.errors.names && (
              <p className="text-sm text-red-500" role="alert">
                {form.formState.errors.names.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Trophy size={18} />
              Quick tips
            </div>
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Even player count works best. We add a Bye if needed.</li>
              <li>Each round mixes partners and opponents.</li>
              <li>
                Courts cap matches per round; extra players will sit that round.
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                aria-label="Generate schedule"
                className="w-full sm:w-auto"
              >
                Generate schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label="Use sample roster"
                onClick={() => form.setValue("names", defaultRoster.join("\n"))}
              >
                Use sample roster
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Clear scores"
                onClick={handleResetScores}
              >
                Clear scores
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">Rounds: {totalRounds || 0}</Badge>
          <Badge variant="secondary">Matches: {schedule.length}</Badge>
          <Badge variant="secondary">Courts: {courtCount}</Badge>
        </div>

        {totalRounds === 0 && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No matches yet</CardTitle>
              <CardDescription>
                Add at least four players and click Generate schedule.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {Object.keys(matchesByRound)
            .sort((a, b) => Number(a) - Number(b))
            .map((roundKey) => {
              const round = Number(roundKey);
              const roundMatches = matchesByRound[round];
              return (
                <Card key={round}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Round {round}</CardTitle>
                      <CardDescription>Rotate after each game.</CardDescription>
                    </div>
                    <Badge>
                      <RotateCw size={14} className="mr-1" />
                      {roundMatches.length} matches
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {roundMatches.map((match) => {
                      const score = scores[match.id];
                      const winner =
                        typeof score?.teamA === "number" &&
                        typeof score?.teamB === "number" &&
                        score.teamA !== score.teamB
                          ? score.teamA > score.teamB
                            ? "Team A"
                            : "Team B"
                          : null;
                      return (
                        <div
                          key={match.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                              <Badge variant="secondary">
                                Court {match.court}
                              </Badge>
                              {winner && (
                                <Badge variant="success">{winner} ahead</Badge>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <TeamBlock label="Team A" team={match.teamA} />
                            <TeamBlock label="Team B" team={match.teamB} />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`score-a-${match.id}`}>
                                Team A score
                              </Label>
                              <Input
                                id={`score-a-${match.id}`}
                                type="number"
                                min={0}
                                inputMode="numeric"
                                aria-label={`Score for Team A court ${match.court}`}
                                value={score?.teamA ?? ""}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) =>
                                  handleScoreChange(
                                    match.id,
                                    "teamA",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`score-b-${match.id}`}>
                                Team B score
                              </Label>
                              <Input
                                id={`score-b-${match.id}`}
                                type="number"
                                min={0}
                                inputMode="numeric"
                                aria-label={`Score for Team B court ${match.court}`}
                                value={score?.teamB ?? ""}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) =>
                                  handleScoreChange(
                                    match.id,
                                    "teamB",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <SitOutList
                      allPlayers={players}
                      matches={roundMatches}
                      label="Sit-out this round"
                    />
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </section>

      {schedule.length > 0 && (
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Trophy size={18} />
            Match sheet
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <Thead>
                <Tr>
                  <Th>Round</Th>
                  <Th>Court</Th>
                  <Th>Team A</Th>
                  <Th>Team B</Th>
                  <Th>Score</Th>
                </Tr>
              </Thead>
              <Tbody>
                {schedule.map((match) => {
                  const score = scores[match.id];
                  return (
                    <Tr key={match.id}>
                      <Td>{match.round}</Td>
                      <Td>{match.court}</Td>
                      <Td>
                        {match.teamA[0].name} + {match.teamA[1].name}
                      </Td>
                      <Td>
                        {match.teamB[0].name} + {match.teamB[1].name}
                      </Td>
                      <Td className="font-semibold">
                        {score?.teamA ?? "–"} : {score?.teamB ?? "–"}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        </section>
      )}
    </main>
  );
}

type TeamBlockProps = {
  label: string;
  team: Team;
};

const TeamBlock = ({ label, team }: TeamBlockProps) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      {label}
    </div>
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {team[0].name}
      </span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {team[1].name}
      </span>
    </div>
  </div>
);

type SitOutListProps = {
  allPlayers: Player[];
  matches: Match[];
  label: string;
};

const SitOutList = ({ allPlayers, matches, label }: SitOutListProps) => {
  const usedIds = new Set<string>();
  matches.forEach((m) => {
    m.teamA.forEach((p) => usedIds.add(p.id));
    m.teamB.forEach((p) => usedIds.add(p.id));
  });
  const sitOut = allPlayers.filter(
    (p) => !usedIds.has(p.id) && p.name !== "Bye"
  );

  if (sitOut.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
      <span className="font-semibold">{label}:</span>
      {sitOut.map((p) => (
        <span
          key={p.id}
          className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-slate-800"
        >
          {p.name}
        </span>
      ))}
    </div>
  );
};
