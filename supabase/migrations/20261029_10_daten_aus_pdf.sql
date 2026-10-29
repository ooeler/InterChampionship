-- Einmalig: Saisonstand 26/27 aus dem PDF "Herren Inter 26-27" übernehmen (Stand 29.10.2026).
-- Ersetzt alle Saison-Daten (Resultate, Pre-Games, Tore/Assists, Anwesenheit, Schiedsrichter) und löscht
-- Abmeldungen, Trainingsleitungen, Restaurants und Strafen. Benutzer, Rollen und Einladungen bleiben.
-- Bilder (Club-Logo, Teamsponsor, Team-Logos) bleiben erhalten.
-- Der bisherige Stand wird vorher gesichert (Trigger keep_league_history + Backup im Release) und lässt sich
-- unter Teams → Datensicherung wiederherstellen.
--
-- Herkunft der Zahlen:
--   Sep/Okt: Anwesenheit als Summe pro Monat (base), Tore/Assists aus der Skorerliste pro Matchtag
--   Nov:     21.10. alle anwesend, 28.10. ohne Raphael Germann und Tobias Keller (laut PDF je 1 von 2 Trainings)
--   Schiedsrichter: Sep Tobias Keller; geplant Feb Robin Thaddey, Mär Michael Süess, Apr Silvan Germann
do $import$
declare
  old jsonb;
  neu jsonb := $json${
 "t": [
  {
   "n": "Lochball Legenden",
   "c": "Andreas Scherrer",
   "p": [
    "Andreas Scherrer",
    "Julien Stadler",
    "Michael Süess",
    "Michael Vetter",
    "Othmar Oeler",
    "Raphael Germann",
    "Stefan Keller",
    "Thomas Allemann"
   ]
  },
  {
   "n": "SpVgg Nieder",
   "c": "Manuel Ammann",
   "p": [
    "Beat Rentsch",
    "Cornel Eberle",
    "Manuel Ammann",
    "Pascal Fröhlich",
    "Pascal Hilpertshauser",
    "Silvan Frehner",
    "Silvan Frey",
    "Tobias Keller"
   ]
  }
 ],
 "m": [
  {
   "tr": [],
   "base": {
    "Andreas Scherrer": 4,
    "Julien Stadler": 4,
    "Michael Süess": 3,
    "Raphael Germann": 3,
    "Michael Vetter": 0,
    "Stefan Keller": 3,
    "Thomas Allemann": 0,
    "Othmar Oeler": 3,
    "Manuel Ammann": 3,
    "Silvan Frey": 1,
    "Pascal Hilpertshauser": 4,
    "Pascal Fröhlich": 4,
    "Silvan Frehner": 3,
    "Cornel Eberle": 2,
    "Beat Rentsch": 3,
    "Tobias Keller": 4
   },
   "gs": [],
   "ref": "Tobias Keller",
   "pre": [
    1,
    3
   ],
   "res": [
    3,
    11
   ],
   "g": {
    "Andreas Scherrer": 1,
    "Othmar Oeler": 1,
    "Manuel Ammann": 2,
    "Pascal Hilpertshauser": 3,
    "Pascal Fröhlich": 1,
    "Silvan Frehner": 1
   },
   "a": {
    "Stefan Keller": 1,
    "Silvan Frey": 2,
    "Pascal Fröhlich": 1
   }
  },
  {
   "tr": [],
   "base": {
    "Andreas Scherrer": 5,
    "Julien Stadler": 5,
    "Michael Süess": 4,
    "Raphael Germann": 5,
    "Michael Vetter": 2,
    "Stefan Keller": 5,
    "Thomas Allemann": 4,
    "Othmar Oeler": 4,
    "Manuel Ammann": 3,
    "Silvan Frey": 3,
    "Pascal Hilpertshauser": 6,
    "Pascal Fröhlich": 4,
    "Silvan Frehner": 5,
    "Cornel Eberle": 4,
    "Beat Rentsch": 3,
    "Tobias Keller": 4
   },
   "gs": [],
   "ref": "",
   "pre": [
    3,
    1
   ],
   "res": [
    9,
    5
   ],
   "g": {
    "Andreas Scherrer": 1,
    "Raphael Germann": 4,
    "Silvan Frey": 2,
    "Pascal Hilpertshauser": 1,
    "Silvan Frehner": 1,
    "Beat Rentsch": 1
   },
   "a": {
    "Andreas Scherrer": 3,
    "Julien Stadler": 1,
    "Raphael Germann": 1,
    "Silvan Frey": 1,
    "Pascal Hilpertshauser": 1,
    "Pascal Fröhlich": 2,
    "Cornel Eberle": 1
   }
  },
  {
   "tr": [
    {
     "d": "2026-10-21",
     "p": [
      "Andreas Scherrer",
      "Julien Stadler",
      "Michael Süess",
      "Michael Vetter",
      "Othmar Oeler",
      "Raphael Germann",
      "Stefan Keller",
      "Thomas Allemann",
      "Beat Rentsch",
      "Cornel Eberle",
      "Manuel Ammann",
      "Pascal Fröhlich",
      "Pascal Hilpertshauser",
      "Silvan Frehner",
      "Silvan Frey",
      "Tobias Keller"
     ]
    },
    {
     "d": "2026-10-28",
     "p": [
      "Andreas Scherrer",
      "Julien Stadler",
      "Michael Süess",
      "Michael Vetter",
      "Othmar Oeler",
      "Stefan Keller",
      "Thomas Allemann",
      "Beat Rentsch",
      "Cornel Eberle",
      "Manuel Ammann",
      "Pascal Fröhlich",
      "Pascal Hilpertshauser",
      "Silvan Frehner",
      "Silvan Frey"
     ]
    },
    {
     "d": "2026-11-04",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  },
  {
   "tr": [
    {
     "d": "2026-11-11",
     "p": []
    },
    {
     "d": "2026-11-18",
     "p": []
    },
    {
     "d": "2026-11-25",
     "p": []
    },
    {
     "d": "2026-12-02",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  },
  {
   "tr": [
    {
     "d": "2026-12-09",
     "p": []
    },
    {
     "d": "2026-12-16",
     "p": []
    },
    {
     "d": "2026-12-23",
     "p": []
    },
    {
     "d": "2027-01-06",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  },
  {
   "tr": [
    {
     "d": "2027-01-13",
     "p": []
    },
    {
     "d": "2027-01-20",
     "p": []
    },
    {
     "d": "2027-01-27",
     "p": []
    },
    {
     "d": "2027-02-03",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "Robin Thaddey",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  },
  {
   "tr": [
    {
     "d": "2027-02-10",
     "p": []
    },
    {
     "d": "2027-02-17",
     "p": []
    },
    {
     "d": "2027-02-24",
     "p": []
    },
    {
     "d": "2027-03-03",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "Michael Süess",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  },
  {
   "tr": [
    {
     "d": "2027-03-10",
     "p": []
    },
    {
     "d": "2027-03-17",
     "p": []
    },
    {
     "d": "2027-03-24",
     "p": []
    },
    {
     "d": "2027-03-31",
     "p": []
    },
    {
     "d": "2027-04-07",
     "p": []
    }
   ],
   "base": {},
   "gs": [],
   "ref": "Silvan Germann",
   "pre": [
    0,
    0
   ],
   "res": [
    null,
    null
   ],
   "g": {},
   "a": {}
  }
 ],
 "sn": "26/27",
 "v": 2
}$json$::jsonb;
begin
  select data into old from public.league_state where id = 'main';
  if old is not null then
    insert into public.league_state_history (state_id, data, updated_by, reason)
      select id, data, updated_by, 'vor Import PDF' from public.league_state where id = 'main';
    neu := neu || jsonb_strip_nulls(jsonb_build_object('logo', old->'logo', 'sp', old->'sp'));
    if old #> '{t,0,img}' is not null then neu := jsonb_set(neu, '{t,0,img}', old #> '{t,0,img}'); end if;
    if old #> '{t,1,img}' is not null then neu := jsonb_set(neu, '{t,1,img}', old #> '{t,1,img}'); end if;
    update public.league_state set data = neu, client = 'import-pdf', updated_at = now() where id = 'main';
  else
    insert into public.league_state (id, data, client) values ('main', neu, 'import-pdf');
  end if;
  delete from public.penalties;
end $import$;
