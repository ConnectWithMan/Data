(function (global) {
  'use strict';

  var COUNSELLING_CONFIG = {
    josaa: {
      id: 'josaa',
      name: 'JoSAA Counselling',
      shortName: 'JoSAA',
      officialName: 'Joint Seat Allocation Authority (JoSAA)',
      officialUrl: 'https://josaa.nic.in/',
      rankMethodology:
        'JoSAA uses JEE (Advanced) ranks for IITs (and IISc Bangalore) and JEE (Main) ranks for NITs, IIITs, and other GFTIs. Ranks for OPEN are Common Rank List (CRL) ranks, while reserved categories (EWS, OBC-NCL, SC, ST, and PwD) use their respective category ranks.',
      typeLabels: { IIT: 'IIT', NIT: 'NIT', '3IT': 'IIIT', CFI: 'Other GFTI' },
      quotaLabels: {
        AI: 'All India',
        HS: 'Home State',
        OS: 'Other State',
        GO: 'Goa',
        JK: 'Jammu and Kashmir',
        LA: 'Ladakh'
      },
      datasets: {
        2026: {
          year: 2026,
          url: '/josaa/cutoff/2026',
          jsonUrl: '/josaa/cutoff/2026.json',
          rounds: [1, 5],
          roundLabels: ['Round 1', 'Round 5'],
          lastUpdated: '2026-11-23',
          rows: 13292,
          hasPrepFlag: true
        },
        2025: {
          year: 2025,
          url: '/josaa/cutoff/2025',
          jsonUrl: '/josaa/cutoff/2025.json',
          rounds: [1, 6],
          roundLabels: ['Round 1', 'Round 6'],
          lastUpdated: '2026-11-23',
          rows: 12274,
          schema: 'seats'
        },
        2024: {
          year: 2024,
          url: '/josaa/cutoff/2024',
          jsonUrl: '/josaa/cutoff/2024.json',
          rounds: [1, 5],
          roundLabels: ['Round 1', 'Round 5'],
          lastUpdated: '2026-11-23',
          rows: 11687
        },
        2023: {
          year: 2023,
          url: '/josaa/cutoff/2023',
          jsonUrl: '/josaa/cutoff/2023.json',
          rounds: [1, 6],
          roundLabels: ['Round 1', 'Round 6'],
          lastUpdated: '2026-11-23',
          rows: 10842
        },
        2022: {
          year: 2022,
          url: '/josaa/cutoff/2022',
          jsonUrl: '/josaa/cutoff/2022.json',
          rounds: [1, 6],
          roundLabels: ['Round 1', 'Round 6'],
          lastUpdated: '2026-11-26',
          rows: 10023,
          hasPrepFlag: true
        }
      }
    },
    csab: {
      id: 'csab',
      name: 'CSAB Special Counselling',
      shortName: 'CSAB',
      officialName: 'Central Seat Allocation Board (CSAB)',
      officialUrl: 'https://csab.nic.in/',
      rankMethodology:
        'CSAB Special rounds use All India CRL (Common Rank List) ranks of JEE (Main) for all categories across NITs, IIITs, and other GFTIs. IITs do not participate in CSAB Special counselling.',
      typeLabels: { IIT: 'IIT', NIT: 'NIT', '3IT': 'IIIT', CFI: 'Other GFTI' },
      quotaLabels: {
        DC: 'DASA-CIWG',
        AD: 'DASA-Non CIWG',
        AI: 'All India',
        HS: 'Home State',
        OS: 'Other State',
        GO: 'Goa',
        JK: 'Jammu and Kashmir',
        LA: 'Ladakh'
      },
      datasets: {
        2026: {
          year: 2026,
          url: '/csab/cutoff/2026',
          jsonUrl: '/csab/cutoff/2026.json',
          rounds: [1, 2],
          roundLabels: ['Round 1', 'Round 2'],
          lastUpdated: '2026-11-23',
          rows: 7758
        },
        2025: {
          year: 2025,
          url: '/csab/cutoff/2025',
          jsonUrl: '/csab/cutoff/2025.json',
          rounds: [1, 2, 3],
          roundLabels: ['Round 1', 'Round 2', 'Round 3'],
          lastUpdated: '2026-11-23',
          rows: 6948
        },
        2024: {
          year: 2024,
          url: '/csab/cutoff/2024',
          jsonUrl: '/csab/cutoff/2024.json',
          rounds: [1, 2],
          roundLabels: ['Round 1', 'Round 2'],
          lastUpdated: '2026-11-23',
          rows: 6205
        }
      }
    }
  };

  global.FAMRAL_CONFIG = COUNSELLING_CONFIG;
})(window);
