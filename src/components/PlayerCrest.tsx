import React from 'react';
import { PlayerStat, Team } from '../types';
import PlayerAvatar from './PlayerAvatar';
import { TeamCrest, CrestSize } from './ui';

interface PlayerCrestProps {
  player: Pick<PlayerStat, 'name' | 'imageUrl' | 'teamId' | 'teamLogoColor' | 'teamName'>;
  teams: Team[];
  photoSize?: 'sm' | 'md' | 'lg' | 'xl';
  crestSize?: CrestSize;
  onSelectTeam?: (teamId: string) => void;
}

// Einheitliches Spielerbild: Spielerfoto, falls hochgeladen – sonst das Vereinswappen
// (klickbar → Vereinsseite). Wird überall genutzt, wo Spieler in Ranglisten stehen.
export default function PlayerCrest({ player, teams, photoSize = 'md', crestSize = 'lg', onSelectTeam }: PlayerCrestProps) {
  if (player.imageUrl) {
    return <PlayerAvatar name={player.name} imageUrl={player.imageUrl} color={player.teamLogoColor} size={photoSize} />;
  }
  const team = teams.find((t) => t.id === player.teamId);
  if (team) {
    return (
      <TeamCrest
        name={team.name}
        shortName={team.shortName}
        color={team.logoColor}
        logoUrl={team.logoUrl}
        size={crestSize}
        onSelect={onSelectTeam ? () => onSelectTeam(team.id) : undefined}
      />
    );
  }
  // Weder Foto noch auflösbares Team: Initialen in Vereinsfarbe
  return <PlayerAvatar name={player.name} color={player.teamLogoColor} size={photoSize} />;
}
