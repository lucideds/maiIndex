// OpenAPI 3.1 description of the public HTTP API, rendered by Scalar at /api/docs.
// Hand-written: keep it in step with routes/songs.ts when a route or param changes.

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Numeric database `id` or the song `shortid`.',
  schema: { type: 'string' },
  example: '11000',
};

const notFound = {
  description: 'Song not found.',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
};

const rangeNote =
  'Honours HTTP `Range` requests (`206 Partial Content`, `416` when unsatisfiable) so mobile Safari can seek.';

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'MaiIndex API',
    version: '1.0.0',
    description:
      'Search, filter and download an indexed catalog of Maimai DX chart archives. ' +
      'Exports are converted on the fly (AstroDX, Majdata Play, Sonolus or raw passthrough) with no temporary disk usage.\n\n' +
      'All `/api` routes are public and share a rate limit (default 200 requests per minute per client); ' +
      'exceeding it returns `429`.\n\n' +
      '**Difficulty slots**: `lv_1` Easy (legacy), `lv_2` Basic, `lv_3` Advanced, `lv_4` Expert, `lv_5` Master, ' +
      '`lv_6` Re:Master, `lv_7` Utage. Empty slots are empty strings or `null`; `+` levels look like `13+`.',
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Songs', description: 'Catalog queries and per-song assets.' },
    { name: 'Export', description: 'On-the-fly chart conversion and download.' },
    { name: 'System', description: 'Service health.' },
  ],
  paths: {
    '/api/songs': {
      get: {
        tags: ['Songs'],
        summary: 'Search and filter songs',
        description:
          'Paginated catalog query. The level bracket (`min`/`max`) matches a song when **any** of its seven slots falls inside it.',
        operationId: 'listSongs',
        parameters: [
          { name: 'search', in: 'query', description: 'Matches title, artist or short ID (substring).', schema: { type: 'string' } },
          { name: 'version', in: 'query', description: 'Exact version string, e.g. `maimai DX BUDDiES`. See `/api/songs/versions`.', schema: { type: 'string' } },
          { name: 'genre', in: 'query', description: 'Exact genre string. See `/api/songs/genres`.', schema: { type: 'string' } },
          { name: 'cabinet', in: 'query', description: 'Cabinet format.', schema: { type: 'string', enum: ['SD', 'DX'] } },
          { name: 'min', in: 'query', description: 'Lower level bound, inclusive. `13+` is `13.7`. Omit for an open end.', schema: { type: 'number' }, example: 13 },
          { name: 'max', in: 'query', description: 'Upper level bound, inclusive. Omit for an open end.', schema: { type: 'number' }, example: 14.7 },
          {
            name: 'sort',
            in: 'query',
            description: 'Sort order. `diff_*` sorts by the highest (desc) or lowest (asc) populated slot.',
            schema: {
              type: 'string',
              default: 'id_asc',
              enum: ['id_asc', 'id_desc', 'title_asc', 'title_desc', 'diff_desc', 'diff_asc', 'bpm_desc', 'bpm_asc'],
            },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', description: 'Page size.', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 24 } },
        ],
        responses: {
          '200': {
            description: 'A page of songs.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SongPage' } } },
          },
          '500': { description: 'Query failed.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/songs/versions': {
      get: {
        tags: ['Songs'],
        summary: 'List versions',
        description: 'Every version string in the catalog with its song count.',
        operationId: 'listVersions',
        responses: {
          '200': {
            description: 'Versions in ascending order.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/VersionCount' } },
              },
            },
          },
        },
      },
    },
    '/api/songs/genres': {
      get: {
        tags: ['Songs'],
        summary: 'List genres',
        description: 'Every genre in the catalog with its song count.',
        operationId: 'listGenres',
        responses: {
          '200': {
            description: 'Genres in ascending order.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/GenreCount' } },
              },
            },
          },
        },
      },
    },
    '/api/songs/levels': {
      get: {
        tags: ['Songs'],
        summary: 'List levels',
        description: 'Distinct level strings across all seven slots, numerically ordered.',
        operationId: 'listLevels',
        responses: {
          '200': {
            description: 'Level strings.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'string' }, example: ['1', '2', '7+', '13', '13+', '14'] },
              },
            },
          },
        },
      },
    },
    '/api/songs/{id}': {
      get: {
        tags: ['Songs'],
        summary: 'Get one song',
        operationId: 'getSong',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'The song, including archive location columns.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Song' } } },
          },
          '404': notFound,
        },
      },
    },
    '/api/songs/{id}/detail': {
      get: {
        tags: ['Songs'],
        summary: 'Get chart detail',
        description:
          'Charter plus per-slot note counts and notes-per-second, parsed from the archive\'s `maidata.txt`. ' +
          'Cached after the first request; `notes` and `nps` are `null` when a chart could not be parsed.',
        operationId: 'getSongDetail',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Chart detail.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SongDetail' } } },
          },
          '404': notFound,
        },
      },
    },
    '/api/songs/{id}/cover': {
      get: {
        tags: ['Songs'],
        summary: 'Get cover image',
        description: `Streams the cover from the song's archive. Cached for one day. ${rangeNote}`,
        operationId: 'getSongCover',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Cover image.',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '206': { description: 'Partial content for a `Range` request.' },
          '404': { description: 'Song, archive or cover not found.' },
          '416': { description: 'Range not satisfiable.' },
        },
      },
    },
    '/api/songs/{id}/audio': {
      get: {
        tags: ['Songs'],
        summary: 'Get audio preview',
        description: `Streams the track from the song's archive. Cached for one day. ${rangeNote}`,
        operationId: 'getSongAudio',
        parameters: [idParam],
        responses: {
          '200': {
            description: 'Audio file.',
            content: {
              'audio/mpeg': { schema: { type: 'string', format: 'binary' } },
              'audio/ogg': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '206': { description: 'Partial content for a `Range` request.' },
          '404': { description: 'Song, archive or audio not found.' },
          '416': { description: 'Range not satisfiable.' },
        },
      },
    },
    '/api/export': {
      post: {
        tags: ['Export'],
        summary: 'Export songs',
        description:
          'Streams the selected songs as a single download, converted on the fly. ' +
          'A single song is named after its title, a batch is `maimai_batch_export.*`. ' +
          'Unknown `format` values fall back to `astrodx`. Limited by `MAX_BATCH_SONGS` (default 100) ' +
          'and `MAX_CONCURRENT_EXPORTS` (default 5).',
        operationId: 'exportSongs',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['songIds'],
                properties: {
                  songIds: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string' },
                    description: 'Song `shortid`s or numeric `id`s.',
                    example: ['11000'],
                  },
                  format: {
                    type: 'string',
                    enum: ['astrodx', 'majdata', 'sonolus', 'raw'],
                    default: 'astrodx',
                    description: '`astrodx` → `.adx`, `sonolus` → `.scp`, `majdata` and `raw` → `.zip`.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The converted archive, sent as an attachment.',
            content: {
              'application/x-adx': { schema: { type: 'string', format: 'binary' } },
              'application/x-scp': { schema: { type: 'string', format: 'binary' } },
              'application/zip': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '400': { description: 'No song IDs, or more than the batch limit.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'None of the IDs matched a song.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '503': { description: 'Too many exports already running. Retry shortly.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        operationId: 'health',
        responses: {
          '200': {
            description: 'Service is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptime: { type: 'number', description: 'Process uptime in seconds.' },
                    database: { type: 'string', example: 'connected' },
                    indexedSongs: { type: 'integer' },
                    lastGithubSync: { type: ['string', 'null'] },
                    memoryUsage: { type: 'object', additionalProperties: { type: 'integer' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
      },
      VersionCount: {
        type: 'object',
        properties: { version: { type: 'string', example: 'maimai DX BUDDiES' }, count: { type: 'integer' } },
      },
      GenreCount: {
        type: 'object',
        properties: { genre: { type: 'string', example: 'maimai' }, count: { type: 'integer' } },
      },
      Song: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          shortid: { type: 'string', description: 'Stable short ID, unique per song.' },
          title: { type: 'string', description: 'May end in `[SD]` or `[DX]`, marking the cabinet chart.' },
          artist: { type: ['string', 'null'] },
          bpm: { type: ['string', 'null'], description: 'Text, may be a range such as `120~180`.' },
          genre: { type: ['string', 'null'] },
          version: { type: ['string', 'null'] },
          cabinet: { type: ['string', 'null'], enum: ['SD', 'DX', null] },
          zip_file: { type: 'string', description: 'Source archive file name.' },
          cover_file: { type: ['string', 'null'] },
          audio_file: { type: ['string', 'null'] },
          lv_1: { type: ['string', 'null'], description: 'Easy (legacy).' },
          lv_2: { type: ['string', 'null'], description: 'Basic.' },
          lv_3: { type: ['string', 'null'], description: 'Advanced.' },
          lv_4: { type: ['string', 'null'], description: 'Expert.' },
          lv_5: { type: ['string', 'null'], description: 'Master.' },
          lv_6: { type: ['string', 'null'], description: 'Re:Master.' },
          lv_7: { type: ['string', 'null'], description: 'Utage.' },
        },
      },
      SongPage: {
        type: 'object',
        properties: {
          songs: { type: 'array', items: { $ref: '#/components/schemas/Song' } },
          total: { type: 'integer', description: 'Matches across all pages.' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      SongDetail: {
        type: 'object',
        properties: {
          shortid: { type: 'string' },
          title: { type: 'string' },
          artist: { type: ['string', 'null'] },
          bpm: { type: ['string', 'null'] },
          genre: { type: ['string', 'null'] },
          version: { type: ['string', 'null'] },
          cabinet: { type: ['string', 'null'] },
          charter: { type: ['string', 'null'] },
          charts: {
            type: 'array',
            description: 'One entry per populated difficulty slot.',
            items: {
              type: 'object',
              properties: {
                slot: { type: 'integer', minimum: 1, maximum: 7, description: 'Maps to `lv_<slot>`.' },
                level: { type: 'string' },
                notes: { type: ['integer', 'null'] },
                nps: { type: ['number', 'null'], description: 'Average notes per second.' },
              },
            },
          },
        },
      },
    },
  },
} as const;
