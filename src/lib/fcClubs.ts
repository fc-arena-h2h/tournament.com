export interface FcClub {
  code: string;
  name: string;
  shortName: string;
  league: string;
  country?: string;
  isUnofficial?: boolean;
  isNational?: boolean;
  logoFile: string;
}

export const CLUB_LEAGUE_FILTERS = [
  'ALL',
  'Premier League',
  'LaLiga EA Sports',
  'Bundesliga',
  'Serie A Enilive',
  "Ligue 1 McDonald's",
  'Rest of World',
  'Unofficial',
  'National Clubs'
] as const;

export const FC_MOBILE_OFFICIAL_CLUBS: FcClub[] = [
  // LaLiga EA Sports
  {
    code: 'CLB_RMA',
    name: 'Real Madrid',
    shortName: 'RMA',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/real_madrid.png'
  },
  {
    code: 'CLB_BAR',
    name: 'FC Barcelona',
    shortName: 'BAR',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/fc_barcelona.png'
  },
  {
    code: 'CLB_ATM',
    name: 'Atlético de Madrid',
    shortName: 'ATM',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/atletico_madrid.png'
  },
  {
    code: 'CLB_GIR',
    name: 'Girona FC',
    shortName: 'GIR',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/girona_fc.png'
  },
  {
    code: 'CLB_RSO',
    name: 'Real Sociedad',
    shortName: 'RSO',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/real_sociedad.png'
  },
  {
    code: 'CLB_BET',
    name: 'Real Betis',
    shortName: 'BET',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/real_betis.png'
  },
  {
    code: 'CLB_VIL',
    name: 'Villarreal CF',
    shortName: 'VIL',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/villarreal_cf.png'
  },
  {
    code: 'CLB_SEV',
    name: 'Sevilla FC',
    shortName: 'SEV',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/sevilla_fc.png'
  },
  {
    code: 'CLB_VAL',
    name: 'Valencia CF',
    shortName: 'VAL',
    league: 'LaLiga EA Sports',
    logoFile: 'clubs/valencia_cf.png'
  },

  // Premier League
  {
    code: 'CLB_MCI',
    name: 'Manchester City',
    shortName: 'MCI',
    league: 'Premier League',
    logoFile: 'clubs/manchester_city.png'
  },
  {
    code: 'CLB_ARS',
    name: 'Arsenal',
    shortName: 'ARS',
    league: 'Premier League',
    logoFile: 'clubs/arsenal.png'
  },
  {
    code: 'CLB_LIV',
    name: 'Liverpool',
    shortName: 'LIV',
    league: 'Premier League',
    logoFile: 'clubs/liverpool.png'
  },
  {
    code: 'CLB_MUN',
    name: 'Manchester United',
    shortName: 'MUN',
    league: 'Premier League',
    logoFile: 'clubs/manchester_united.png'
  },
  {
    code: 'CLB_CHE',
    name: 'Chelsea',
    shortName: 'CHE',
    league: 'Premier League',
    logoFile: 'clubs/chelsea.png'
  },
  {
    code: 'CLB_TOT',
    name: 'Tottenham Hotspur',
    shortName: 'TOT',
    league: 'Premier League',
    logoFile: 'clubs/tottenham.png'
  },
  {
    code: 'CLB_NEW',
    name: 'Newcastle United',
    shortName: 'NEW',
    league: 'Premier League',
    logoFile: 'clubs/newcastle.png'
  },
  {
    code: 'CLB_AVL',
    name: 'Aston Villa',
    shortName: 'AVL',
    league: 'Premier League',
    logoFile: 'clubs/aston_villa.png'
  },
  {
    code: 'CLB_WHU',
    name: 'West Ham United',
    shortName: 'WHU',
    league: 'Premier League',
    logoFile: 'clubs/west_ham.png'
  },

  // Bundesliga
  {
    code: 'CLB_BAY',
    name: 'Bayern München',
    shortName: 'BAY',
    league: 'Bundesliga',
    logoFile: 'clubs/bayern_munich.png'
  },
  {
    code: 'CLB_BVB',
    name: 'Borussia Dortmund',
    shortName: 'BVB',
    league: 'Bundesliga',
    logoFile: 'clubs/borussia_dortmund.png'
  },
  {
    code: 'CLB_B04',
    name: 'Bayer 04 Leverkusen',
    shortName: 'B04',
    league: 'Bundesliga',
    logoFile: 'clubs/bayer_leverkusen.png'
  },
  {
    code: 'CLB_RBL',
    name: 'RB Leipzig',
    shortName: 'RBL',
    league: 'Bundesliga',
    logoFile: 'clubs/rb_leipzig.png'
  },

  // Serie A Enilive
  {
    code: 'CLB_JUV',
    name: 'Juventus',
    shortName: 'JUV',
    league: 'Serie A Enilive',
    logoFile: 'clubs/juventus.png'
  },
  {
    code: 'CLB_INT',
    name: 'Inter Milan',
    shortName: 'INT',
    league: 'Serie A Enilive',
    logoFile: 'clubs/inter_milan.png'
  },
  {
    code: 'CLB_ACM',
    name: 'AC Milan',
    shortName: 'ACM',
    league: 'Serie A Enilive',
    logoFile: 'clubs/ac_milan.png'
  },
  {
    code: 'CLB_NAP',
    name: 'SSC Napoli',
    shortName: 'NAP',
    league: 'Serie A Enilive',
    logoFile: 'clubs/napoli.png'
  },
  {
    code: 'CLB_ROM',
    name: 'AS Roma',
    shortName: 'ROM',
    league: 'Serie A Enilive',
    logoFile: 'clubs/as_roma.png'
  },

  // Ligue 1 McDonald's
  {
    code: 'CLB_PSG',
    name: 'Paris Saint-Germain',
    shortName: 'PSG',
    league: "Ligue 1 McDonald's",
    logoFile: 'clubs/psg.png'
  },
  {
    code: 'CLB_OM',
    name: 'Olympique de Marseille',
    shortName: 'OM',
    league: "Ligue 1 McDonald's",
    logoFile: 'clubs/marseille.png'
  },
  {
    code: 'CLB_OL',
    name: 'Olympique Lyonnais',
    shortName: 'OL',
    league: "Ligue 1 McDonald's",
    logoFile: 'clubs/lyon.png'
  },
  {
    code: 'CLB_MON',
    name: 'AS Monaco',
    shortName: 'MON',
    league: "Ligue 1 McDonald's",
    logoFile: 'clubs/monaco.png'
  },

  // Rest of World (MLS, Roshn Saudi League, Liga Portugal, Eredivisie, Argentina, Türkiye)
  {
    code: 'CLB_MIA',
    name: 'Inter Miami CF',
    shortName: 'MIA',
    league: 'Rest of World',
    logoFile: 'clubs/inter_miami.png'
  },
  {
    code: 'CLB_ALN',
    name: 'Al-Nassr FC',
    shortName: 'ALN',
    league: 'Rest of World',
    logoFile: 'clubs/al_nassr.png'
  },
  {
    code: 'CLB_ALH',
    name: 'Al-Hilal SFC',
    shortName: 'ALH',
    league: 'Rest of World',
    logoFile: 'clubs/al_hilal.png'
  },
  {
    code: 'CLB_ALI',
    name: 'Al-Ittihad Club',
    shortName: 'ALI',
    league: 'Rest of World',
    logoFile: 'clubs/al_ittihad.png'
  },
  {
    code: 'CLB_BEN',
    name: 'SL Benfica',
    shortName: 'BEN',
    league: 'Rest of World',
    logoFile: 'clubs/benfica.png'
  },
  {
    code: 'CLB_POR',
    name: 'FC Porto',
    shortName: 'POR',
    league: 'Rest of World',
    logoFile: 'clubs/fc_porto.png'
  },
  {
    code: 'CLB_SCP',
    name: 'Sporting CP',
    shortName: 'SCP',
    league: 'Rest of World',
    logoFile: 'clubs/sporting_cp.png'
  },
  {
    code: 'CLB_AJA',
    name: 'AFC Ajax',
    shortName: 'AJA',
    league: 'Rest of World',
    logoFile: 'clubs/ajax.png'
  },
  {
    code: 'CLB_PSV',
    name: 'PSV Eindhoven',
    shortName: 'PSV',
    league: 'Rest of World',
    logoFile: 'clubs/psv.png'
  },
  {
    code: 'CLB_BOC',
    name: 'Boca Juniors',
    shortName: 'BOC',
    league: 'Rest of World',
    logoFile: 'clubs/boca_juniors.png'
  },
  {
    code: 'CLB_RIV',
    name: 'River Plate',
    shortName: 'RIV',
    league: 'Rest of World',
    logoFile: 'clubs/river_plate.png'
  },
  {
    code: 'CLB_GAL',
    name: 'Galatasaray SK',
    shortName: 'GAL',
    league: 'Rest of World',
    logoFile: 'clubs/galatasaray.png'
  },
  {
    code: 'CLB_FEN',
    name: 'Fenerbahçe SK',
    shortName: 'FEN',
    league: 'Rest of World',
    logoFile: 'clubs/fenerbahce.png'
  }
];

export const FC_MOBILE_UNOFFICIAL_CLUBS: FcClub[] = [
  // Bangladesh (BPL)
  {
    code: 'CLB_BSK',
    name: 'Bashundhara Kings',
    shortName: 'BSK',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/bashundhara_kings.png'
  },
  {
    code: 'CLB_MSC',
    name: 'Mohammedan SC Dhaka',
    shortName: 'MSC',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/mohammedan_dhaka.png'
  },
  {
    code: 'CLB_ABA',
    name: 'Dhaka Abahani',
    shortName: 'ABA',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/dhaka_abahani.png'
  },
  {
    code: 'CLB_SRK',
    name: 'Sheikh Russel KC',
    shortName: 'SRK',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/sheikh_russel.png'
  },
  {
    code: 'CLB_BPF',
    name: 'Bangladesh Police FC',
    shortName: 'BPF',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/bangladesh_police.png'
  },
  {
    code: 'CLB_FOR',
    name: 'Fortis FC',
    shortName: 'FOR',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/fortis_fc.png'
  },
  {
    code: 'CLB_BRU',
    name: 'Brothers Union',
    shortName: 'BRU',
    league: 'Bangladesh • BPL',
    country: 'Bangladesh',
    isUnofficial: true,
    logoFile: 'clubs/brothers_union.png'
  },

  // India (ISL)
  {
    code: 'CLB_MBS',
    name: 'Mohun Bagan SG',
    shortName: 'MBSG',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/mohun_bagan.png'
  },
  {
    code: 'CLB_EBF',
    name: 'East Bengal FC',
    shortName: 'EBFC',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/east_bengal.png'
  },
  {
    code: 'CLB_MCF',
    name: 'Mumbai City FC',
    shortName: 'MCFC',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/mumbai_city.png'
  },
  {
    code: 'CLB_KBF',
    name: 'Kerala Blasters FC',
    shortName: 'KBFC',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/kerala_blasters.png'
  },
  {
    code: 'CLB_BFC',
    name: 'Bengaluru FC',
    shortName: 'BFC',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/bengaluru_fc.png'
  },
  {
    code: 'CLB_GOA',
    name: 'FC Goa',
    shortName: 'FCG',
    league: 'India • ISL',
    country: 'India',
    isUnofficial: true,
    logoFile: 'clubs/fc_goa.png'
  },

  // Indonesia (Liga 1)
  {
    code: 'CLB_PSB',
    name: 'Persib Bandung',
    shortName: 'PSB',
    league: 'Indonesia • Liga 1',
    country: 'Indonesia',
    isUnofficial: true,
    logoFile: 'clubs/persib_bandung.png'
  },
  {
    code: 'CLB_PSJ',
    name: 'Persija Jakarta',
    shortName: 'PSJ',
    league: 'Indonesia • Liga 1',
    country: 'Indonesia',
    isUnofficial: true,
    logoFile: 'clubs/persija_jakarta.png'
  },
  {
    code: 'CLB_PBY',
    name: 'Persebaya Surabaya',
    shortName: 'PBY',
    league: 'Indonesia • Liga 1',
    country: 'Indonesia',
    isUnofficial: true,
    logoFile: 'clubs/persebaya_surabaya.png'
  },
  {
    code: 'CLB_ARE',
    name: 'Arema FC',
    shortName: 'ARE',
    league: 'Indonesia • Liga 1',
    country: 'Indonesia',
    isUnofficial: true,
    logoFile: 'clubs/arema_fc.png'
  },
  {
    code: 'CLB_BAL',
    name: 'Bali United FC',
    shortName: 'BAL',
    league: 'Indonesia • Liga 1',
    country: 'Indonesia',
    isUnofficial: true,
    logoFile: 'clubs/bali_united.png'
  },

  // Malaysia (Super League)
  {
    code: 'CLB_JDT',
    name: "Johor Darul Ta'zim",
    shortName: 'JDT',
    league: 'Malaysia • MFL',
    country: 'Malaysia',
    isUnofficial: true,
    logoFile: 'clubs/johor_jdt.png'
  },
  {
    code: 'CLB_SEL',
    name: 'Selangor FC',
    shortName: 'SEL',
    league: 'Malaysia • MFL',
    country: 'Malaysia',
    isUnofficial: true,
    logoFile: 'clubs/selangor_fc.png'
  },
  {
    code: 'CLB_TER',
    name: 'Terengganu FC',
    shortName: 'TER',
    league: 'Malaysia • MFL',
    country: 'Malaysia',
    isUnofficial: true,
    logoFile: 'clubs/terengganu_fc.png'
  },
  {
    code: 'CLB_SAB',
    name: 'Sabah FC',
    shortName: 'SAB',
    league: 'Malaysia • MFL',
    country: 'Malaysia',
    isUnofficial: true,
    logoFile: 'clubs/sabah_fc.png'
  },

  // Japan (J1 League)
  {
    code: 'CLB_URA',
    name: 'Urawa Red Diamonds',
    shortName: 'URA',
    league: 'Japan • J1 League',
    country: 'Japan',
    isUnofficial: true,
    logoFile: 'clubs/urawa_reds.png'
  },
  {
    code: 'CLB_KAW',
    name: 'Kawasaki Frontale',
    shortName: 'KAW',
    league: 'Japan • J1 League',
    country: 'Japan',
    isUnofficial: true,
    logoFile: 'clubs/kawasaki_frontale.png'
  },
  {
    code: 'CLB_VIS',
    name: 'Vissel Kobe',
    shortName: 'VIS',
    league: 'Japan • J1 League',
    country: 'Japan',
    isUnofficial: true,
    logoFile: 'clubs/vissel_kobe.png'
  },
  {
    code: 'CLB_YFM',
    name: 'Yokohama F. Marinos',
    shortName: 'YFM',
    league: 'Japan • J1 League',
    country: 'Japan',
    isUnofficial: true,
    logoFile: 'clubs/yokohama_marinos.png'
  },
  {
    code: 'CLB_KAS',
    name: 'Kashima Antlers',
    shortName: 'KAS',
    league: 'Japan • J1 League',
    country: 'Japan',
    isUnofficial: true,
    logoFile: 'clubs/kashima_antlers.png'
  },

  // Thailand (Thai League 1)
  {
    code: 'CLB_BUR',
    name: 'Buriram United',
    shortName: 'BUR',
    league: 'Thailand • Thai League',
    country: 'Thailand',
    isUnofficial: true,
    logoFile: 'clubs/buriram_united.png'
  },
  {
    code: 'CLB_BGP',
    name: 'BG Pathum United',
    shortName: 'BGP',
    league: 'Thailand • Thai League',
    country: 'Thailand',
    isUnofficial: true,
    logoFile: 'clubs/bg_pathum.png'
  },

  // Brazil, Egypt, Mexico, South Africa
  {
    code: 'CLB_FLA',
    name: 'CR Flamengo',
    shortName: 'FLA',
    league: 'Brazil • Série A',
    country: 'Brazil',
    isUnofficial: true,
    logoFile: 'clubs/flamengo.png'
  },
  {
    code: 'CLB_PAL',
    name: 'SE Palmeiras',
    shortName: 'PAL',
    league: 'Brazil • Série A',
    country: 'Brazil',
    isUnofficial: true,
    logoFile: 'clubs/palmeiras.png'
  },
  {
    code: 'CLB_SAN',
    name: 'Santos FC',
    shortName: 'SAN',
    league: 'Brazil • Série A',
    country: 'Brazil',
    isUnofficial: true,
    logoFile: 'clubs/santos_fc.png'
  },
  {
    code: 'CLB_COR',
    name: 'SC Corinthians',
    shortName: 'COR',
    league: 'Brazil • Série A',
    country: 'Brazil',
    isUnofficial: true,
    logoFile: 'clubs/corinthians.png'
  },
  {
    code: 'CLB_FLU',
    name: 'Fluminense FC',
    shortName: 'FLU',
    league: 'Brazil • Série A',
    country: 'Brazil',
    isUnofficial: true,
    logoFile: 'clubs/fluminense.png'
  },
  {
    code: 'CLB_AHL',
    name: 'Al Ahly SC',
    shortName: 'AHL',
    league: 'Egypt • Premier League',
    country: 'Egypt',
    isUnofficial: true,
    logoFile: 'clubs/al_ahly.png'
  },
  {
    code: 'CLB_AME',
    name: 'Club América',
    shortName: 'AME',
    league: 'Mexico • Liga MX',
    country: 'Mexico',
    isUnofficial: true,
    logoFile: 'clubs/club_america.png'
  },
  {
    code: 'CLB_KAI',
    name: 'Kaizer Chiefs',
    shortName: 'KAI',
    league: 'South Africa • PSL',
    country: 'South Africa',
    isUnofficial: true,
    logoFile: 'clubs/kaizer_chiefs.png'
  }
];

export const FC_MOBILE_NATIONAL_CLUBS: FcClub[] = [
  {
    code: 'NAT_ARG',
    name: 'Argentina',
    shortName: 'ARG',
    league: 'CONMEBOL • National',
    country: 'Argentina',
    isNational: true,
    logoFile: 'clubs/nat_argentina.png'
  },
  {
    code: 'NAT_BRA',
    name: 'Brazil',
    shortName: 'BRA',
    league: 'CONMEBOL • National',
    country: 'Brazil',
    isNational: true,
    logoFile: 'clubs/nat_brazil.png'
  },
  {
    code: 'NAT_FRA',
    name: 'France',
    shortName: 'FRA',
    league: 'UEFA • National',
    country: 'France',
    isNational: true,
    logoFile: 'clubs/nat_france.png'
  },
  {
    code: 'NAT_ESP',
    name: 'Spain',
    shortName: 'ESP',
    league: 'UEFA • National',
    country: 'Spain',
    isNational: true,
    logoFile: 'clubs/nat_spain.png'
  },
  {
    code: 'NAT_ENG',
    name: 'England',
    shortName: 'ENG',
    league: 'UEFA • National',
    country: 'England',
    isNational: true,
    logoFile: 'clubs/nat_england.png'
  },
  {
    code: 'NAT_POR',
    name: 'Portugal',
    shortName: 'POR',
    league: 'UEFA • National',
    country: 'Portugal',
    isNational: true,
    logoFile: 'clubs/nat_portugal.png'
  },
  {
    code: 'NAT_GER',
    name: 'Germany',
    shortName: 'GER',
    league: 'UEFA • National',
    country: 'Germany',
    isNational: true,
    logoFile: 'clubs/nat_germany.png'
  },
  {
    code: 'NAT_ITA',
    name: 'Italy',
    shortName: 'ITA',
    league: 'UEFA • National',
    country: 'Italy',
    isNational: true,
    logoFile: 'clubs/nat_italy.png'
  },
  {
    code: 'NAT_NED',
    name: 'Netherlands',
    shortName: 'NED',
    league: 'UEFA • National',
    country: 'Netherlands',
    isNational: true,
    logoFile: 'clubs/nat_netherlands.png'
  },
  {
    code: 'NAT_BEL',
    name: 'Belgium',
    shortName: 'BEL',
    league: 'UEFA • National',
    country: 'Belgium',
    isNational: true,
    logoFile: 'clubs/nat_belgium.png'
  },
  {
    code: 'NAT_CRO',
    name: 'Croatia',
    shortName: 'CRO',
    league: 'UEFA • National',
    country: 'Croatia',
    isNational: true,
    logoFile: 'clubs/nat_croatia.png'
  },
  {
    code: 'NAT_URU',
    name: 'Uruguay',
    shortName: 'URU',
    league: 'CONMEBOL • National',
    country: 'Uruguay',
    isNational: true,
    logoFile: 'clubs/nat_uruguay.png'
  },
  {
    code: 'NAT_COL',
    name: 'Colombia',
    shortName: 'COL',
    league: 'CONMEBOL • National',
    country: 'Colombia',
    isNational: true,
    logoFile: 'clubs/nat_colombia.png'
  },
  {
    code: 'NAT_BAN',
    name: 'Bangladesh',
    shortName: 'BAN',
    league: 'AFC • National',
    country: 'Bangladesh',
    isNational: true,
    logoFile: 'clubs/nat_bangladesh.png'
  },
  {
    code: 'NAT_IND',
    name: 'India',
    shortName: 'IND',
    league: 'AFC • National',
    country: 'India',
    isNational: true,
    logoFile: 'clubs/nat_india.png'
  },
  {
    code: 'NAT_IDN',
    name: 'Indonesia',
    shortName: 'IDN',
    league: 'AFC • National',
    country: 'Indonesia',
    isNational: true,
    logoFile: 'clubs/nat_indonesia.png'
  },
  {
    code: 'NAT_MAS',
    name: 'Malaysia',
    shortName: 'MAS',
    league: 'AFC • National',
    country: 'Malaysia',
    isNational: true,
    logoFile: 'clubs/nat_malaysia.png'
  },
  {
    code: 'NAT_JPN',
    name: 'Japan',
    shortName: 'JPN',
    league: 'AFC • National',
    country: 'Japan',
    isNational: true,
    logoFile: 'clubs/nat_japan.png'
  },
  {
    code: 'NAT_KOR',
    name: 'South Korea',
    shortName: 'KOR',
    league: 'AFC • National',
    country: 'South Korea',
    isNational: true,
    logoFile: 'clubs/nat_south_korea.png'
  },
  {
    code: 'NAT_KSA',
    name: 'Saudi Arabia',
    shortName: 'KSA',
    league: 'AFC • National',
    country: 'Saudi Arabia',
    isNational: true,
    logoFile: 'clubs/nat_saudi_arabia.png'
  },
  {
    code: 'NAT_QAT',
    name: 'Qatar',
    shortName: 'QAT',
    league: 'AFC • National',
    country: 'Qatar',
    isNational: true,
    logoFile: 'clubs/nat_qatar.png'
  },
  {
    code: 'NAT_AUS',
    name: 'Australia',
    shortName: 'AUS',
    league: 'AFC • National',
    country: 'Australia',
    isNational: true,
    logoFile: 'clubs/nat_australia.png'
  },
  {
    code: 'NAT_THA',
    name: 'Thailand',
    shortName: 'THA',
    league: 'AFC • National',
    country: 'Thailand',
    isNational: true,
    logoFile: 'clubs/nat_thailand.png'
  },
  {
    code: 'NAT_MAR',
    name: 'Morocco',
    shortName: 'MAR',
    league: 'CAF • National',
    country: 'Morocco',
    isNational: true,
    logoFile: 'clubs/nat_morocco.png'
  },
  {
    code: 'NAT_EGY',
    name: 'Egypt',
    shortName: 'EGY',
    league: 'CAF • National',
    country: 'Egypt',
    isNational: true,
    logoFile: 'clubs/nat_egypt.png'
  },
  {
    code: 'NAT_SEN',
    name: 'Senegal',
    shortName: 'SEN',
    league: 'CAF • National',
    country: 'Senegal',
    isNational: true,
    logoFile: 'clubs/nat_senegal.png'
  },
  {
    code: 'NAT_NGA',
    name: 'Nigeria',
    shortName: 'NGA',
    league: 'CAF • National',
    country: 'Nigeria',
    isNational: true,
    logoFile: 'clubs/nat_nigeria.png'
  },
  {
    code: 'NAT_USA',
    name: 'United States',
    shortName: 'USA',
    league: 'CONCACAF • National',
    country: 'United States',
    isNational: true,
    logoFile: 'clubs/nat_usa.png'
  },
  {
    code: 'NAT_MEX',
    name: 'Mexico',
    shortName: 'MEX',
    league: 'CONCACAF • National',
    country: 'Mexico',
    isNational: true,
    logoFile: 'clubs/nat_mexico.png'
  },
  {
    code: 'NAT_TUR',
    name: 'Türkiye',
    shortName: 'TUR',
    league: 'UEFA • National',
    country: 'Türkiye',
    isNational: true,
    logoFile: 'clubs/nat_turkiye.png'
  },
  {
    code: 'NAT_SUI',
    name: 'Switzerland',
    shortName: 'SUI',
    league: 'UEFA • National',
    country: 'Switzerland',
    isNational: true,
    logoFile: 'clubs/nat_switzerland.png'
  },
  {
    code: 'NAT_DEN',
    name: 'Denmark',
    shortName: 'DEN',
    league: 'UEFA • National',
    country: 'Denmark',
    isNational: true,
    logoFile: 'clubs/nat_denmark.png'
  }
];

export const FC_MOBILE_CLUBS: FcClub[] = [
  ...FC_MOBILE_OFFICIAL_CLUBS,
  ...FC_MOBILE_UNOFFICIAL_CLUBS,
  ...FC_MOBILE_NATIONAL_CLUBS
];

const CLUB_MAP = new Map<string, FcClub>(
  FC_MOBILE_CLUBS.map((club) => [club.code.toUpperCase(), club])
);

export function getClubByCode(code?: string | null): FcClub | null {
  if (!code || typeof code !== 'string') return null;
  return CLUB_MAP.get(code.trim().toUpperCase()) || null;
}

export function getClubLogoUrl(code?: string | null): string | null {
  const club = getClubByCode(code);
  if (!club) return null;
  const baseUrl =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL
      ? (import.meta as any).env.BASE_URL
      : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${club.logoFile}`;
}
