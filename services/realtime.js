// from bilal
import { supabase } from "../lib/supabaseClient";

// subscribe to realtime validated reps for a given team
export function subscribeToTeamSessions(teamId, callback) {
  const channel = supabase
    .channel(`sessions:team:${teamId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sessions",
        filter: `team_id=eq.${teamId}`,
      },
      callback
    )
    .subscribe();

  return channel;
}


// subscribe to realtime validated reps for a given player
export function subscribeToPlayerValidatedReps(playerId, callback) {
  const channel = supabase
    .channel(`validated_reps:player:${playerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "validated_reps",
        filter: `player_id=eq.${playerId}`,
      },
      callback
    )
    .subscribe();

  return channel;
}

export function unsubscribeChannel(channel) {
  if (channel) {
    supabase.removeChannel(channel);
  }
}
