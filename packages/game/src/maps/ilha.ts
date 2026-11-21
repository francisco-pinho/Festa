/** Gerado por `npm run mapa -- importar ilha` a partir do Blender. Não editar à mão. */
import type { MapLayout } from '../layout';

export const layout: MapLayout = {
  "rules": {
    "id": "ilha",
    "name": "Ilha do Coqueiro",
    "description": "Colar de ilhotas: em cada uma escolhes o caminho à volta. Maré baixa abre a ponte da baía; maré alta abre o túnel da gruta (muda a cada 3 rondas). Puxa a alavanca da aldeia para abrir a selva até ao vulcão, e cuidado com o canhão da praia!",
    "theme": "island",
    "startId": "casa_4",
    "shops": [
      {
        "id": "praia",
        "name": "Quiosque da Praia",
        "kind": "geral",
        "spaceId": "casa_18"
      },
      {
        "id": "gruta",
        "name": "Bazar da Gruta",
        "kind": "luxo",
        "spaceId": "casa_32"
      },
      {
        "id": "navio",
        "name": "Taberna do Navio",
        "kind": "barata",
        "spaceId": "casa_55"
      }
    ],
    "tunnels": [
      {
        "from": "casa_49",
        "to": "casa_23",
        "kind": "cave",
        "cost": 0,
        "name": "Túnel da Gruta"
      }
    ],
    "gates": [
      {
        "from": "casa_36",
        "to": "casa_84",
        "flag": "highTide",
        "openWhen": false,
        "name": "Ponte"
      },
      {
        "from": "casa_49",
        "to": "casa_23",
        "flag": "highTide",
        "openWhen": true,
        "name": "Gruta"
      },
      {
        "from": "casa_10",
        "to": "casa_95",
        "flag": "jungle",
        "openWhen": true,
        "name": "Portão da Selva",
        "lever": true
      }
    ],
    "levers": [
      {
        "spaceId": "casa_0",
        "flag": "jungle",
        "name": "Alavanca da Selva",
        "onText": "O portão da selva abriu!",
        "offText": "O portão da selva fechou!"
      }
    ],
    "tolls": [],
    "cannons": [
      {
        "spaceId": "casa_43",
        "targets": [
          "casa_62",
          "casa_73",
          "casa_101",
          "casa_56"
        ],
        "name": "Canhão Pirata"
      }
    ],
    "bankName": "Cofre do Pirata",
    "zoneEvents": {
      "beach": "chest",
      "jungle": "chest"
    },
    "mechanic": "tide",
    "initialFlags": {
      "highTide": false,
      "jungle": false
    },
    "eventKind": "tornado",
    "plateaus": [
      {
        "x": 0,
        "z": 18,
        "r": 10.2,
        "y": 1.2
      },
      {
        "x": 30,
        "z": 22,
        "r": 8.2,
        "y": 1.2
      },
      {
        "x": -40,
        "z": 2,
        "r": 9.2,
        "y": 1.2
      },
      {
        "x": -22,
        "z": 26,
        "r": 8.2,
        "y": 1.2
      }
    ],
    "mountains": [
      {
        "x": 0,
        "z": -12,
        "r": 15,
        "h": 9
      }
    ],
    "scenery": "/maps/ilha.glb"
  },
  "spaces": [
    {
      "name": "casa_0",
      "x": -8,
      "y": 1.2,
      "z": 18,
      "type": "lever",
      "next": [
        "casa_2",
        "casa_8"
      ],
      "zone": "village"
    },
    {
      "name": "casa_1",
      "x": 8,
      "y": 1.2,
      "z": 18,
      "type": "vs",
      "next": [
        "casa_45"
      ],
      "zone": "village"
    },
    {
      "name": "casa_2",
      "x": -7.21,
      "y": 1.2,
      "z": 21.47,
      "type": "blue",
      "next": [
        "casa_3"
      ],
      "zone": "village"
    },
    {
      "name": "casa_3",
      "x": -4.99,
      "y": 1.2,
      "z": 24.25,
      "type": "blue",
      "next": [
        "casa_4"
      ],
      "zone": "village"
    },
    {
      "name": "casa_4",
      "x": -1.78,
      "y": 1.2,
      "z": 25.8,
      "type": "start",
      "next": [
        "casa_5"
      ],
      "zone": "village"
    },
    {
      "name": "casa_5",
      "x": 1.78,
      "y": 1.2,
      "z": 25.8,
      "type": "blue",
      "next": [
        "casa_6"
      ],
      "zone": "village"
    },
    {
      "name": "casa_6",
      "x": 4.99,
      "y": 1.2,
      "z": 24.25,
      "type": "blue",
      "next": [
        "casa_7"
      ],
      "zone": "village",
      "star": true
    },
    {
      "name": "casa_7",
      "x": 7.21,
      "y": 1.2,
      "z": 21.47,
      "type": "item",
      "next": [
        "casa_1"
      ],
      "zone": "village"
    },
    {
      "name": "casa_8",
      "x": -6.93,
      "y": 1.2,
      "z": 14,
      "type": "blue",
      "next": [
        "casa_9"
      ],
      "zone": "village",
      "star": true
    },
    {
      "name": "casa_9",
      "x": -4,
      "y": 1.2,
      "z": 11.07,
      "type": "event",
      "next": [
        "casa_10"
      ],
      "zone": "village"
    },
    {
      "name": "casa_10",
      "x": 0,
      "y": 1.2,
      "z": 10,
      "type": "red",
      "next": [
        "casa_11",
        "casa_95"
      ],
      "zone": "village"
    },
    {
      "name": "casa_11",
      "x": 4,
      "y": 1.2,
      "z": 11.07,
      "type": "red",
      "next": [
        "casa_12"
      ],
      "zone": "village"
    },
    {
      "name": "casa_12",
      "x": 6.93,
      "y": 1.2,
      "z": 14,
      "type": "bank",
      "next": [
        "casa_1"
      ],
      "zone": "village"
    },
    {
      "name": "casa_13",
      "x": 24,
      "y": 1.2,
      "z": 22,
      "type": "blue",
      "next": [
        "casa_15",
        "casa_17"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_14",
      "x": 30,
      "y": 1.2,
      "z": 16,
      "type": "blue",
      "next": [
        "casa_50"
      ],
      "zone": "beach",
      "star": true
    },
    {
      "name": "casa_15",
      "x": 24.8,
      "y": 1.2,
      "z": 19,
      "type": "item",
      "next": [
        "casa_16"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_16",
      "x": 27,
      "y": 1.2,
      "z": 16.8,
      "type": "blue",
      "next": [
        "casa_14"
      ],
      "zone": "beach",
      "star": true
    },
    {
      "name": "casa_17",
      "x": 25.31,
      "y": 1.2,
      "z": 25.74,
      "type": "blue",
      "next": [
        "casa_18"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_18",
      "x": 28.66,
      "y": 1.2,
      "z": 27.85,
      "type": "shop",
      "next": [
        "casa_19"
      ],
      "zone": "beach",
      "shopId": "praia"
    },
    {
      "name": "casa_19",
      "x": 32.6,
      "y": 1.2,
      "z": 27.41,
      "type": "red",
      "next": [
        "casa_20"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_20",
      "x": 35.41,
      "y": 1.2,
      "z": 24.6,
      "type": "event",
      "next": [
        "casa_21"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_21",
      "x": 35.85,
      "y": 1.2,
      "z": 20.66,
      "type": "unlucky",
      "next": [
        "casa_22"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_22",
      "x": 33.74,
      "y": 1.2,
      "z": 17.31,
      "type": "unlucky",
      "next": [
        "casa_14"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_23",
      "x": -40,
      "y": 1.2,
      "z": -5,
      "type": "blue",
      "next": [
        "casa_25",
        "casa_30"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_24",
      "x": -40,
      "y": 1.2,
      "z": 9,
      "type": "blue",
      "next": [
        "casa_77"
      ],
      "zone": "cave",
      "star": true
    },
    {
      "name": "casa_25",
      "x": -36.5,
      "y": 1.2,
      "z": -4.06,
      "type": "blue",
      "next": [
        "casa_26"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_26",
      "x": -33.94,
      "y": 1.2,
      "z": -1.5,
      "type": "blue",
      "next": [
        "casa_27"
      ],
      "zone": "cave",
      "star": true
    },
    {
      "name": "casa_27",
      "x": -33,
      "y": 1.2,
      "z": 2,
      "type": "vs",
      "next": [
        "casa_28"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_28",
      "x": -33.94,
      "y": 1.2,
      "z": 5.5,
      "type": "blue",
      "next": [
        "casa_29"
      ],
      "zone": "cave",
      "star": true
    },
    {
      "name": "casa_29",
      "x": -36.5,
      "y": 1.2,
      "z": 8.06,
      "type": "red",
      "next": [
        "casa_24"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_30",
      "x": -43.5,
      "y": 1.2,
      "z": -4.06,
      "type": "event",
      "next": [
        "casa_31"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_31",
      "x": -46.06,
      "y": 1.2,
      "z": -1.5,
      "type": "item",
      "next": [
        "casa_32"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_32",
      "x": -47,
      "y": 1.2,
      "z": 2,
      "type": "shop",
      "next": [
        "casa_33"
      ],
      "zone": "cave",
      "shopId": "gruta"
    },
    {
      "name": "casa_33",
      "x": -46.06,
      "y": 1.2,
      "z": 5.5,
      "type": "lucky",
      "next": [
        "casa_34"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_34",
      "x": -43.5,
      "y": 1.2,
      "z": 8.06,
      "type": "event",
      "next": [
        "casa_24"
      ],
      "zone": "cave"
    },
    {
      "name": "casa_35",
      "x": -28,
      "y": 1.2,
      "z": 26,
      "type": "blue",
      "next": [
        "casa_37",
        "casa_41"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_36",
      "x": -16,
      "y": 1.2,
      "z": 26,
      "type": "blue",
      "next": [
        "casa_82",
        "casa_84"
      ],
      "zone": "beach",
      "star": true
    },
    {
      "name": "casa_37",
      "x": -26.85,
      "y": 1.2,
      "z": 29.53,
      "type": "red",
      "next": [
        "casa_38"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_38",
      "x": -23.85,
      "y": 1.2,
      "z": 31.71,
      "type": "lucky",
      "next": [
        "casa_39"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_39",
      "x": -20.15,
      "y": 1.2,
      "z": 31.71,
      "type": "event",
      "next": [
        "casa_40"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_40",
      "x": -17.15,
      "y": 1.2,
      "z": 29.53,
      "type": "event",
      "next": [
        "casa_36"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_41",
      "x": -26.85,
      "y": 1.2,
      "z": 22.47,
      "type": "lucky",
      "next": [
        "casa_42"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_42",
      "x": -23.85,
      "y": 1.2,
      "z": 20.29,
      "type": "blue",
      "next": [
        "casa_43"
      ],
      "zone": "beach",
      "star": true
    },
    {
      "name": "casa_43",
      "x": -20.15,
      "y": 1.2,
      "z": 20.29,
      "type": "cannon",
      "next": [
        "casa_44"
      ],
      "zone": "beach"
    },
    {
      "name": "casa_44",
      "x": -17.15,
      "y": 1.2,
      "z": 22.47,
      "type": "blue",
      "next": [
        "casa_36"
      ],
      "zone": "beach",
      "star": true
    },
    {
      "name": "casa_45",
      "x": 11.2,
      "y": 0,
      "z": 18.8,
      "type": "lucky",
      "next": [
        "casa_46"
      ]
    },
    {
      "name": "casa_46",
      "x": 14.4,
      "y": 0,
      "z": 19.6,
      "type": "blue",
      "next": [
        "casa_47"
      ],
      "star": true
    },
    {
      "name": "casa_47",
      "x": 17.6,
      "y": 0,
      "z": 20.4,
      "type": "blue",
      "next": [
        "casa_48"
      ]
    },
    {
      "name": "casa_48",
      "x": 20.8,
      "y": 0,
      "z": 21.2,
      "type": "event",
      "next": [
        "casa_13"
      ]
    },
    {
      "name": "casa_49",
      "x": 34,
      "y": 0,
      "z": -16,
      "type": "blue",
      "next": [
        "casa_58",
        "casa_23"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_50",
      "x": 32.44,
      "y": 0,
      "z": 12.97,
      "type": "red",
      "next": [
        "casa_51"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_51",
      "x": 34.57,
      "y": 0,
      "z": 9.72,
      "type": "event",
      "next": [
        "casa_52"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_52",
      "x": 36.3,
      "y": 0,
      "z": 6.25,
      "type": "villain",
      "next": [
        "casa_53"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_53",
      "x": 37.53,
      "y": 0,
      "z": 2.56,
      "type": "red",
      "next": [
        "casa_54",
        "casa_106"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_54",
      "x": 38.12,
      "y": 0,
      "z": -1.27,
      "type": "blue",
      "next": [
        "casa_55"
      ],
      "zone": "ship",
      "star": true
    },
    {
      "name": "casa_55",
      "x": 38.02,
      "y": 0,
      "z": -5.16,
      "type": "shop",
      "next": [
        "casa_56"
      ],
      "zone": "ship",
      "shopId": "navio"
    },
    {
      "name": "casa_56",
      "x": 37.24,
      "y": 0,
      "z": -8.96,
      "type": "blue",
      "next": [
        "casa_57"
      ],
      "zone": "ship",
      "star": true
    },
    {
      "name": "casa_57",
      "x": 35.86,
      "y": 0,
      "z": -12.59,
      "type": "red",
      "next": [
        "casa_49"
      ],
      "zone": "ship"
    },
    {
      "name": "casa_58",
      "x": 32.25,
      "y": 0,
      "z": -21.6,
      "type": "event",
      "next": [
        "casa_59"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_59",
      "x": 29.61,
      "y": 0,
      "z": -25.79,
      "type": "lucky",
      "next": [
        "casa_60"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_60",
      "x": 26.14,
      "y": 0,
      "z": -29.34,
      "type": "blue",
      "next": [
        "casa_61"
      ],
      "zone": "volcano",
      "star": true
    },
    {
      "name": "casa_61",
      "x": 22.1,
      "y": 0,
      "z": -32.24,
      "type": "blue",
      "next": [
        "casa_62"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_62",
      "x": 17.68,
      "y": 0,
      "z": -34.5,
      "type": "red",
      "next": [
        "casa_63"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_63",
      "x": 13.01,
      "y": 0,
      "z": -36.17,
      "type": "red",
      "next": [
        "casa_64"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_64",
      "x": 8.17,
      "y": 0,
      "z": -37.3,
      "type": "villain",
      "next": [
        "casa_65"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_65",
      "x": 3.23,
      "y": 0,
      "z": -37.89,
      "type": "blue",
      "next": [
        "casa_66"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_66",
      "x": -1.74,
      "y": 0,
      "z": -37.97,
      "type": "blue",
      "next": [
        "casa_67"
      ],
      "zone": "volcano",
      "star": true
    },
    {
      "name": "casa_67",
      "x": -6.69,
      "y": 0,
      "z": -37.53,
      "type": "blue",
      "next": [
        "casa_68"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_68",
      "x": -11.56,
      "y": 0,
      "z": -36.57,
      "type": "vs",
      "next": [
        "casa_69"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_69",
      "x": -16.3,
      "y": 0,
      "z": -35.06,
      "type": "blue",
      "next": [
        "casa_70"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_70",
      "x": -20.81,
      "y": 0,
      "z": -32.98,
      "type": "lucky",
      "next": [
        "casa_71"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_71",
      "x": -24.98,
      "y": 0,
      "z": -30.28,
      "type": "blue",
      "next": [
        "casa_72"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_72",
      "x": -28.64,
      "y": 0,
      "z": -26.93,
      "type": "item",
      "next": [
        "casa_73"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_73",
      "x": -31.56,
      "y": 0,
      "z": -22.93,
      "type": "unlucky",
      "next": [
        "casa_74"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_74",
      "x": -33.44,
      "y": 0,
      "z": -18.34,
      "type": "blue",
      "next": [
        "casa_75"
      ],
      "zone": "volcano",
      "star": true
    },
    {
      "name": "casa_75",
      "x": -35.37,
      "y": 0,
      "z": -13.8,
      "type": "event",
      "next": [
        "casa_76"
      ],
      "zone": "volcano"
    },
    {
      "name": "casa_76",
      "x": -37.69,
      "y": 0,
      "z": -9.4,
      "type": "blue",
      "next": [
        "casa_23"
      ],
      "zone": "volcano",
      "star": true
    },
    {
      "name": "casa_77",
      "x": -38,
      "y": 0,
      "z": 11.83,
      "type": "blue",
      "next": [
        "casa_78"
      ]
    },
    {
      "name": "casa_78",
      "x": -36,
      "y": 0,
      "z": 14.67,
      "type": "blue",
      "next": [
        "casa_79"
      ],
      "star": true
    },
    {
      "name": "casa_79",
      "x": -34,
      "y": 0,
      "z": 17.5,
      "type": "event",
      "next": [
        "casa_80"
      ]
    },
    {
      "name": "casa_80",
      "x": -32,
      "y": 0,
      "z": 20.33,
      "type": "blue",
      "next": [
        "casa_81"
      ],
      "star": true
    },
    {
      "name": "casa_81",
      "x": -30,
      "y": 0,
      "z": 23.17,
      "type": "lucky",
      "next": [
        "casa_35"
      ]
    },
    {
      "name": "casa_82",
      "x": -13.33,
      "y": 0,
      "z": 23.33,
      "type": "blue",
      "next": [
        "casa_83"
      ],
      "star": true
    },
    {
      "name": "casa_83",
      "x": -10.67,
      "y": 0,
      "z": 20.67,
      "type": "event",
      "next": [
        "casa_0"
      ]
    },
    {
      "name": "casa_84",
      "x": -12.84,
      "y": 0,
      "z": 28.89,
      "type": "event",
      "next": [
        "casa_85"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_85",
      "x": -9.38,
      "y": 0,
      "z": 31.42,
      "type": "red",
      "next": [
        "casa_86"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_86",
      "x": -5.6,
      "y": 0,
      "z": 33.43,
      "type": "item",
      "next": [
        "casa_87"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_87",
      "x": -1.52,
      "y": 0,
      "z": 34.71,
      "type": "blue",
      "next": [
        "casa_88"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_88",
      "x": 2.74,
      "y": 0,
      "z": 35.08,
      "type": "blue",
      "next": [
        "casa_89"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_89",
      "x": 6.97,
      "y": 0,
      "z": 34.46,
      "type": "villain",
      "next": [
        "casa_90"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_90",
      "x": 10.98,
      "y": 0,
      "z": 32.96,
      "type": "lucky",
      "next": [
        "casa_91"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_91",
      "x": 14.68,
      "y": 0,
      "z": 30.8,
      "type": "lucky",
      "next": [
        "casa_92"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_92",
      "x": 18.05,
      "y": 0,
      "z": 28.16,
      "type": "red",
      "next": [
        "casa_93"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_93",
      "x": 21.15,
      "y": 0,
      "z": 25.2,
      "type": "event",
      "next": [
        "casa_13"
      ],
      "zone": "bridge"
    },
    {
      "name": "casa_94",
      "x": 0,
      "y": 9,
      "z": -12,
      "type": "blue",
      "next": [
        "casa_119"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_95",
      "x": -2.43,
      "y": 0,
      "z": 5.89,
      "type": "blue",
      "next": [
        "casa_96"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_96",
      "x": -4.67,
      "y": 0,
      "z": 4.42,
      "type": "blue",
      "next": [
        "casa_97"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_97",
      "x": -6.62,
      "y": 0,
      "z": 2.6,
      "type": "event",
      "next": [
        "casa_98"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_98",
      "x": -8.23,
      "y": 0.04,
      "z": 0.47,
      "type": "unlucky",
      "next": [
        "casa_99"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_99",
      "x": -9.4,
      "y": 0.74,
      "z": -1.94,
      "type": "item",
      "next": [
        "casa_100"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_100",
      "x": -10.04,
      "y": 1.49,
      "z": -4.53,
      "type": "event",
      "next": [
        "casa_101"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_101",
      "x": -10.07,
      "y": 2.3,
      "z": -7.2,
      "type": "red",
      "next": [
        "casa_102"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_102",
      "x": -9.41,
      "y": 3.2,
      "z": -9.78,
      "type": "blue",
      "next": [
        "casa_103"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_103",
      "x": -8.02,
      "y": 4.19,
      "z": -12.05,
      "type": "blue",
      "next": [
        "casa_104"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_104",
      "x": -5.91,
      "y": 5.31,
      "z": -13.67,
      "type": "blue",
      "next": [
        "casa_105"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_105",
      "x": -3.32,
      "y": 6.61,
      "z": -14.2,
      "type": "red",
      "next": [
        "casa_94"
      ],
      "zone": "jungle"
    },
    {
      "name": "casa_106",
      "x": 31.88,
      "y": 0,
      "z": 3.36,
      "type": "blue",
      "next": [
        "casa_107"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_107",
      "x": 28.85,
      "y": 0,
      "z": 4.93,
      "type": "blue",
      "next": [
        "casa_108"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_108",
      "x": 25.66,
      "y": 0,
      "z": 6.15,
      "type": "blue",
      "next": [
        "casa_109"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_109",
      "x": 22.35,
      "y": 0,
      "z": 6.99,
      "type": "unlucky",
      "next": [
        "casa_110"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_110",
      "x": 18.97,
      "y": 0,
      "z": 7.41,
      "type": "blue",
      "next": [
        "casa_111"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_111",
      "x": 15.55,
      "y": 0,
      "z": 7.36,
      "type": "blue",
      "next": [
        "casa_112"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_112",
      "x": 12.19,
      "y": 0,
      "z": 6.81,
      "type": "blue",
      "next": [
        "casa_113"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_113",
      "x": 8.95,
      "y": 0,
      "z": 5.74,
      "type": "red",
      "next": [
        "casa_114"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_114",
      "x": 5.95,
      "y": 0,
      "z": 4.11,
      "type": "blue",
      "next": [
        "casa_115"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_115",
      "x": 3.32,
      "y": 0.4,
      "z": 1.94,
      "type": "event",
      "next": [
        "casa_116"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_116",
      "x": 1.21,
      "y": 2.2,
      "z": -0.74,
      "type": "event",
      "next": [
        "casa_117"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_117",
      "x": -0.21,
      "y": 4.1,
      "z": -3.83,
      "type": "blue",
      "next": [
        "casa_118"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_118",
      "x": -0.8,
      "y": 6.07,
      "z": -7.18,
      "type": "blue",
      "next": [
        "casa_94"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_119",
      "x": -0.25,
      "y": 6.77,
      "z": -15.71,
      "type": "blue",
      "next": [
        "casa_120"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_120",
      "x": -0.5,
      "y": 4.54,
      "z": -19.42,
      "type": "lucky",
      "next": [
        "casa_121"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_121",
      "x": -0.74,
      "y": 2.31,
      "z": -23.13,
      "type": "blue",
      "next": [
        "casa_122"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_122",
      "x": -0.99,
      "y": 0.08,
      "z": -26.84,
      "type": "blue",
      "next": [
        "casa_123"
      ],
      "zone": "mountain",
      "star": true
    },
    {
      "name": "casa_123",
      "x": -1.24,
      "y": 0,
      "z": -30.55,
      "type": "blue",
      "next": [
        "casa_124"
      ],
      "zone": "mountain"
    },
    {
      "name": "casa_124",
      "x": -1.49,
      "y": 0,
      "z": -34.26,
      "type": "blue",
      "next": [
        "casa_66"
      ],
      "zone": "mountain",
      "star": true
    }
  ]
};
