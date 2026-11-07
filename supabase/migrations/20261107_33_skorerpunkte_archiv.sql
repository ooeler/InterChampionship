-- Spielerarchiv: Rang nach Skorerpunkten (Tore + Assists) statt nur nach Assists, wie in der Rangliste
alter table public.player_seasons rename column rank_assists to rank_points;
