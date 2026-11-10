// US (and US territory) telephone area codes → IANA time zone.
// Each code maps to the zone covering most of its area; codes that straddle
// a time-zone line are listed in SPLIT with a note.

const DATA: Record<string, Record<string, string>> = {
  'America/New_York': {
    CT: '203 475 860 959',
    DE: '302',
    DC: '202 771',
    FL: '239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954',
    GA: '229 404 470 478 678 706 762 770 912 943',
    KY: '502 606 859',
    ME: '207',
    MD: '227 240 301 410 443 667',
    MA: '339 351 413 508 617 774 781 857 978',
    NH: '603',
    NJ: '201 551 609 640 732 848 856 862 908 973',
    NY: '212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934',
    NC: '252 336 472 704 743 828 910 919 980 984',
    OH: '216 220 234 283 326 330 380 419 436 440 513 567 614 740 937',
    PA: '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878',
    RI: '401',
    SC: '803 821 839 843 854 864',
    TN: '423 865',
    VT: '802',
    VA: '276 434 540 571 686 703 757 804 826 948',
    WV: '304 681',
  },
  'America/Detroit': { MI: '231 248 269 313 517 586 616 679 734 810 906 947 989' },
  'America/Indiana/Indianapolis': { IN: '219 260 317 463 574 765 812 930' },
  'America/Chicago': {
    AL: '205 251 256 334 659 938',
    AR: '327 479 501 870',
    IL: '217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872',
    IA: '319 515 563 641 712',
    KS: '316 620 785 913',
    KY: '270 364',
    LA: '225 318 337 457 504 985',
    MN: '218 320 507 612 651 763 924 952',
    MS: '228 601 662 769',
    MO: '235 314 417 557 573 636 660 816 975',
    NE: '308 402 531',
    ND: '701',
    OK: '405 539 572 580 918',
    SD: '605',
    TN: '615 629 731 901 931',
    TX: '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 936 940 945 956 972 979',
    WI: '262 274 353 414 534 608 715 920',
  },
  'America/Denver': {
    CO: '303 719 720 748 970 983',
    MT: '406',
    NM: '505 575',
    TX: '915',
    UT: '385 435 801',
    WY: '307',
  },
  'America/Boise': { ID: '208 986' },
  'America/Phoenix': { AZ: '480 520 602 623 928' },
  'America/Los_Angeles': {
    CA: '209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 738 747 760 805 818 820 831 840 858 909 916 925 949 951',
    NV: '702 725 775',
    OR: '458 503 541 971',
    WA: '206 253 360 425 509 564',
  },
  'America/Anchorage': { AK: '907' },
  'Pacific/Honolulu': { HI: '808' },
  'America/Puerto_Rico': { PR: '787 939' },
  'America/St_Thomas': { VI: '340' },
  'Pacific/Guam': { GU: '671' },
  'Pacific/Saipan': { MP: '670' },
  'Pacific/Pago_Pago': { AS: '684' },
};

const SPLIT: Record<string, string> = {
  '850': 'Western panhandle (Pensacola, Panama City) is Central',
  '448': 'Western panhandle (Pensacola, Panama City) is Central',
  '219': 'Northwest Indiana (Gary) is Central',
  '812': 'Some southwest counties (Evansville) are Central',
  '930': 'Some southwest counties (Evansville) are Central',
  '906': 'Four counties bordering Wisconsin are Central',
  '270': 'Elizabethtown / Fort Knox area is Eastern',
  '364': 'Elizabethtown / Fort Knox area is Eastern',
  '931': 'Some eastern counties are Eastern',
  '620': 'A few western counties are Mountain',
  '785': 'A few western counties are Mountain',
  '308': 'Western Nebraska panhandle is Mountain',
  '605': 'Western South Dakota (Rapid City) is Mountain',
  '701': 'Southwest North Dakota is Mountain',
  '208': 'North Idaho (Coeur d’Alene) is Pacific',
  '986': 'North Idaho (Coeur d’Alene) is Pacific',
  '541': 'Most of Malheur County is Mountain',
  '928': 'Navajo Nation observes daylight saving time',
  '423': 'Marion County (west of Chattanooga) is Central',
  '775': 'West Wendover is Mountain',
  '907': 'Western Aleutian Islands are Hawaii–Aleutian time',
};

export interface AreaCodeInfo {
  code: string;
  state: string;
  tz: string;
  note?: string;
}

const LOOKUP: Record<string, AreaCodeInfo> = {};
for (const [tz, states] of Object.entries(DATA)) {
  for (const [state, codes] of Object.entries(states)) {
    for (const code of codes.split(' ')) LOOKUP[code] = { code, state, tz, note: SPLIT[code] };
  }
}

export function lookupAreaCode(code: string): AreaCodeInfo | undefined {
  return LOOKUP[code];
}
