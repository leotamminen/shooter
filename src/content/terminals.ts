import type { TerminalDef } from "../types";

// The password lives in exactly one place in source -- this constant --
// even though it also appears (via template-literal interpolation, not a
// second hardcoded copy) inside the fake filesystem's file content below.
// If this file ever changes, never hardcode the password a second time.
const ROOM1_PASSWORD = "X7K-92Q4";

// records_terminal puzzle follow-up: this room's fixed hash/plaintext pair
// -- exported so main.ts can inject both into ui/Terminal.ts's constructor
// (the same "define once in content/, pass in as data" shape ROOM1_PASSWORD
// itself would use if runJohn() needed it directly, which it can't since
// ui/Terminal.ts never imports content/ directly). RECORDS_TARGET_HASH also
// appears directly in records_terminal's own copyableSecrets below, so the
// value is never hardcoded a second time either.
export const RECORDS_TARGET_HASH =
  "5dbf877e8070fc9b6fa1f479bbd69cc4087ce4b5c432c91326ec712c712a361e";
export const RECORDS_TARGET_PLAINTEXT = "731894";

// records-room entity placement follow-up: the physical hash-length
// reference sign this room's own puzzle text described (companion content
// to records_terminal, given alongside it but not actually materialized as
// an exported constant until this follow-up placed the entity that needed
// it) -- content/maps.ts's campaign_sign_2 renders this via the "sign"
// decoration variant's existing createSignDecoration()/MapEntity.text.
export const RECORDS_HASH_SIGN_TEXT = `MD5 = 32 characters
SHA-1 = 40 characters
SHA-256 = 64 characters
SHA-512 = 128 characters

Put "raw-" in front of the type when cracking.`;

export const TERMINALS: TerminalDef[] = [
  {
    id: "room1_terminal",
    password: ROOM1_PASSWORD,
    // Root has zero files directly in it and exactly one subdirectory, so
    // "cd" is actually exercised by a player solving this, not dead
    // functionality only "ls"/"cat" ever touch.
    root: {
      name: "/",
      files: [],
      directories: [
        {
          name: "backup",
          files: [
            {
              name: "credentials.txt",
              // Checkpoint 19: {{VAULT_PIN}} is substituted live by
              // ui/Terminal.ts's runCat() with Campaign's current per-run
              // vault pin (via a getVaultPin callback) -- it is never a
              // literal value in source, unlike ROOM1_PASSWORD above,
              // since the vault pin regenerates every run and this content
              // string is static.
              content: `Top secret do not share this!
// TODO: hide the password better
door override password: ${ROOM1_PASSWORD}

vault pin: {{VAULT_PIN}}`,
            },
          ],
          directories: [],
        },
      ],
    },
  },
  // room2_terminal (checkpoint 19): no password, no files -- its username
  // is revealed by the "whoami" command and checked by Room 3's real
  // password_lock (campaign_lock_3, secretField: "username" in
  // content/maps.ts), which is what actually opens the door.
  {
    id: "room2_terminal",
    username: "svc-maintenance",
    root: {
      name: "/",
      files: [],
      directories: [],
    },
  },
  // room3_terminal: teaches hidden-file discovery ("ls -a") rather than a
  // straight cat-the-obvious-file puzzle -- ls with no flags only ever
  // shows the 8 non-hidden home-directory folders (see
  // ui/Terminal.ts's runLs() hidden-file convention), so a player has to
  // already know (or be told, via the paired "sign" decoration in
  // content/maps.ts) that dotfiles exist and go looking with -a before
  // .bash_history is even visible. password's copy-button still fires
  // automatically once .bash_history's content is read, via the existing
  // checkpoint-17 content.includes(password) mechanism -- no new
  // accessibility code needed.
  {
    id: "room3_terminal",
    password: "NIGHTFALL",
    root: {
      name: "/",
      files: [
        { name: ".bash_history", content: "doorctl unlock --code NIGHTFALL" },
        {
          name: ".bashrc",
          content: "# ~/.bashrc\n# User-specific aliases and functions\nalias ll='ls -la'",
        },
        {
          name: ".bash_logout",
          content: "# ~/.bash_logout\n# executed by bash when login shell exits",
        },
      ],
      directories: [
        { name: "Desktop", files: [], directories: [] },
        { name: "Documents", files: [], directories: [] },
        { name: "Downloads", files: [], directories: [] },
        { name: "Music", files: [], directories: [] },
        { name: "Pictures", files: [], directories: [] },
        { name: "Public", files: [], directories: [] },
        { name: "Templates", files: [], directories: [] },
        { name: "Videos", files: [], directories: [] },
        { name: ".cache", files: [], directories: [] },
        { name: ".config", files: [], directories: [] },
      ],
    },
  },
  // empty_room_terminal: the pair of terminals in the pillar room (linkedTo
  // this) exist purely to carry the silent paired-teleport effect
  // (MapEntity.teleportPairId) -- deliberately unremarkable, no password,
  // no secret, just enough of a filesystem that "ls"/"cd" aren't dead
  // commands here. Not room1_terminal's real puzzle content and not a
  // second copy of it -- reusing puzzle content in a room where nothing is
  // actually being solved would be confusing, implying a password matters
  // here when it doesn't.
  {
    id: "empty_room_terminal",
    root: {
      name: "/",
      files: [],
      directories: [
        { name: "misc", files: [], directories: [] },
        { name: "temp", files: [], directories: [] },
      ],
    },
  },
  // workstation_terminal: the content campaign_terminal_4 actually shows --
  // both when interacted with directly, and (per createTerminal()'s
  // content-swap) when arrived at via campaign_terminal_3's teleport, since
  // both paths resolve to the same TerminalDef by construction. connectMessage
  // replaces the generic "Connected..." banner with an in-fiction cue that
  // something has already changed here before the player typed anything --
  // read literally, "connection re-routed" is a small foreshadowing of the
  // teleport itself. note.txt is gated by requiresRoot -- "sudo cat note.txt"
  // reveals the narrative payoff. It no longer opens anything by itself
  // (superseded, Data Center entrance follow-up): campaign_door_5 was
  // relocated to the Data Center's own real entrance and rebuilt as a
  // "door_prop" decoration -- purely visual set dressing, passable from
  // the very first frame regardless of whether this file is ever read --
  // so the note's own in-fiction claim ("I managed to remotely unlock the
  // door behind you") is now flavor text, not a mechanical trigger.
  {
    id: "workstation_terminal",
    connectMessage: "guest@workstation:~$\n[!] Connection re-routed. Origin host unreachable.",
    root: {
      name: "/",
      files: [
        {
          name: "note.txt",
          requiresRoot: true,
          content: `I managed to remotely unlock the door behind you — it's open now.
Your memory has been wiped. You're part of a classified experiment; I can't say more than that.
If you make it out alive, find me — look for a book called 'Revolution Q' in the library once you're out.
Right now, go through the door straight into the data center. Get the supervisor's fingerprint from the coffee cup on his desk — it'll get you further.
Be careful.

PS. Your subject ID is NIGHTFALL-07.

— K.`,
        },
      ],
      directories: [],
    },
  },
  // data_center_terminal: PLACEHOLDER content only -- the Data Center's
  // real puzzle hasn't been designed yet (that room is still being built
  // separately by hand, see CLAUDE.md's future mechanics). Exists purely
  // so campaign_terminal_6 opens to something real instead of a dangling
  // linkedTo reference; a short connectMessage plus an empty filesystem
  // is enough to prove it's not dead functionality. Expect this entire
  // TerminalDef to be replaced once the room's actual content is designed.
  // Data Center polish: logMode: true replaces the normal ls/cd/cat
  // filesystem browser with live-updating fake access logs (see
  // ui/Terminal.ts) -- root is still present but never actually reached in
  // logMode, kept only because TerminalDef.root isn't optional.
  {
    id: "data_center_terminal",
    connectMessage: "SERVER-04 :: idle",
    logMode: true,
    root: {
      name: "/",
      files: [],
      directories: [],
    },
  },
  // records_terminal: the grep/john hash-crack puzzle. Room/door/entity
  // placement for wherever this terminal actually sits is being built
  // separately by hand -- this TerminalDef only covers content and command
  // mechanics. unlockedCommands activates grep (recognized since checkpoint
  // 19 but never actually usable anywhere until now) and the new john
  // command (see ui/Terminal.ts's runGrep()/runJohn()) for this terminal
  // only -- every other terminal's RESTRICTED_COMMANDS behavior (always
  // denied) is unaffected. copyableSecrets: [RECORDS_TARGET_HASH] is what
  // gives row 47's hash (and only that hash, never a whole line/the whole
  // file) a copy button when it appears in cat/grep output, the same
  // content.includes(...)-style detection every other revealed secret in
  // this file already uses -- see ui/Terminal.ts's findCopyValue().
  {
    id: "records_terminal",
    // records-room entity placement follow-up: the room's own door code --
    // the john-cracked plaintext (RECORDS_TARGET_PLAINTEXT), not a second,
    // independently-chosen password. This is what campaign_lock_6's
    // default secretField: "password" actually checks the player's input
    // against; nothing hardcodes "731894" a second time anywhere.
    password: RECORDS_TARGET_PLAINTEXT,
    unlockedCommands: ["grep", "john"],
    copyableSecrets: [RECORDS_TARGET_HASH],
    root: {
      name: "/",
      files: [
        // Hidden (leading ".") -- invisible under plain ls, same
        // Room-3-established convention, needs ls -a/-la to even see it
        // exists before cat/grep can be tried against it. Row 47 (subject
        // NIGHTFALL-07, matching the player's own subject ID from
        // workstation_terminal's note.txt) is the only mechanically
        // meaningful row; every other row is flavor/noise.
        {
          name: ".subjects",
          content: `0001 | W. Renner    | NIGHTFALL-24 | ACTIVE | 7432d1026706d7e805da846a32c3bb81e3c29b62
0002 | B. Osei      | IRONVEIL-25  | ACTIVE | 73c8eb5bb682575ec87a171ac826a6fc
0003 | W. Whitfield | GRAYWOLF-09  | ACTIVE | 8dcb74f21345d2cce8038a39d5e0853964b50af0
0004 | D. Ibarra    | REDCIPHER-29 | ACTIVE | 1722f244f58d669cbee3772a077021721a278f64
0005 | Z. Ibarra    | ASHFALL-19   | RETIRED| fd633dbdde131ca3766e4d58e72e310275dff6c1
0006 | F. Achebe    | NIGHTFALL-13 | ACTIVE | 9df469611a11f5125227c3712da86a78c49ea20e32684b27b95e909348334896a68f812d810a485ed03241b4d419b1b673bd4755d05ad7853c1f76eb97706ca8
0007 | C. Amari     | SILENTOAK-12 | KIA    | a0385813dbad3c681d06bd2aa399dac946dc59c0996daeee6f529a279764017f2ed6cfc7403d75e173e4eaede5fe878f78e2978aa2447c462ddaed16dc0cf0b9
0008 | N. Kessler   | PALEHORN-18  | MIA    | f78df0cac5e40c02d4e518ca6eaac8d82f01b721
0009 | A. Petrov    | IRONVEIL-27  | ACTIVE | 74f36e8b5359309cc6273931bdb2a0df3dbe4d58
0010 | V. Pruitt    | COLDFRONT-25 | RETIRED| d8a728e7eca0fa5f6b8a880627df7ffe0297c79bfbdabe898736a3566f893697b590481194f309ffea518f32cf21449273d7cee9d9136682575250def91799e2
0011 | X. Petrov    | SILENTOAK-26 | KIA    | d3748421599e3e9c8fe21da80270815fe85df2fb
0012 | P. Delgado   | REDCIPHER-22 | ACTIVE | adf9c1e2a8a3c0ed16bfe16849ef307590d273e3
0013 | W. Solberg   | GRAYWOLF-16  | MIA    | 8dff7e4c6428da8099f4efbacea67c7d1afcc4f14a3e3e04d42f8ac2acaf1279
0014 | H. Voss      | DUSKRUNNER-14| ACTIVE | e5901a19bbd47d5552c7f47e8e80e952
0015 | Q. Vance     | ASHFALL-10   | KIA    | 8e96cf37cb990c801f97b7684319e1b429ad564b858f9a3e247cb2c083eb8cb37f0a72e9d34119f3374cebd4d3fd81b6ee7b3bb1c863e2601a7462667a408448
0016 | F. Renner    | NIGHTFALL-05 | ACTIVE | 7a05814d32feb3e719e01fcd3fe22a4248ac9ed336de7daecd3ada8b4f2222d3
0017 | Z. Voss      | REDCIPHER-26 | ACTIVE | a3dbd199b364f73bb387d080589ab054
0018 | U. Osei      | PALEHORN-03  | ACTIVE | 26cdea5b9a2145128edfed863bd39f91
0019 | H. Achebe    | ASHFALL-02   | ACTIVE | 96489a30fd54c7b2c1d0e2adcd93c0a5eb2d37dc
0020 | S. Kowalski  | PALEHORN-28  | ACTIVE | 7a5236bb4734865425feeaa4e2fe981b29ee11b922ce1e6af41e3a2517ee5bb9
0021 | N. Torres    | REDCIPHER-22 | KIA    | a2a3c984a24b9c429ca42db0b956af67
0022 | E. Okafor    | DUSKRUNNER-10| ACTIVE | a4c4555e1db7e9e779f6bee9cd56481f
0023 | M. Novak     | DUSKRUNNER-23| RETIRED| 9258e4d27eb0d1cb7c2b70a3a4419f4f
0024 | Q. Holt      | NIGHTFALL-29 | ACTIVE | 864d3979317de23f0749d0b7d52b20cf
0025 | B. Brandt    | PALEHORN-12  | ACTIVE | b2b73a41ba5ef542e196161a9cf8169b
0026 | B. Kessler   | REDCIPHER-09 | ACTIVE | dceca5ffb82d2d59a32a99ed5ebe1bd812cb504e1427bbc14ebbe24bca87305f
0027 | S. Achebe    | COLDFRONT-04 | ACTIVE | e69f6342e5e2ab29955b73647f0bbe4229cfdd24a2eeb454d134955a7b928684
0028 | W. Farrow    | ASHFALL-18   | ACTIVE | 45a102186d0f99f7c9e215edfe6a4aabc4b3a7e3
0029 | J. Whitfield | IRONVEIL-05  | ACTIVE | 9cd75aa65fef9f02ce76b119ff903d48
0030 | Z. Vance     | PALEHORN-12  | ACTIVE | 16b92ce8343cbab46c1114afe44aa5c9af9f0ba3d90f871f5c471360ead4d6df146afca5eab8f67897996fafb893ccb49192be8f6688437717713daf3405dff6
0031 | K. Delgado   | SILENTOAK-21 | ACTIVE | 715d51cf591093a9ef4e863a5e850a96
0032 | F. Holt      | PALEHORN-27  | RETIRED| 2c354fa708c7e8a908b713e95c939b774f4ebdf672eb231645ae36f2e1e4de1e
0033 | X. Pruitt    | SILENTOAK-24 | ACTIVE | 80621db212f19d54dbcecc24b35c47009edc77eb48631d076231e171ce761497aa7947d9815df1bcadd49c5f7794e1dd4c786a2eb2618c1266f6a90663f76c7a
0034 | K. Achebe    | BLACKREED-18 | KIA    | 98bfe3fa6bad17408d946a7c7fa8ffe5b54f511210d472406eb1ff00d00890d5
0035 | D. Ibarra    | DUSKRUNNER-17| ACTIVE | 68b8c2bce779212cccf1052fda3176f812815a06
0036 | U. Okafor    | PALEHORN-30  | ACTIVE | 57cac42b13d72aca08ef7bcd5c2972284c4cab3209eb83425ded302b2ac09dc2
0037 | Z. Manning   | COLDFRONT-29 | ACTIVE | c54898f425d8d9f2b87f6e3490cacaead49a6fa5
0038 | N. Delgado   | SILENTOAK-24 | MIA    | 7ac8cb3650e6e92df49784dc2efcd1b237b51cad303877ebce4b0f39d234b9ae6fbf3eea29130a35755ade7c55dc06edc0668235ba6e38facc3bbe5924a37935
0039 | M. Callahan  | GRAYWOLF-17  | RETIRED| 4cd5f55f945ae1b0f46cfdfdef5207918795ef338b1e6d3791e8b2e376bd54661b85a99834d184474a7cf48dce22c8befa02eb2c6d6f8a9a4fa113e035ee0d64
0040 | W. Farrow    | GRAYWOLF-28  | ACTIVE | b82b51c97d2306f247e00a3d4f27c233
0041 | L. Vance     | SILENTOAK-05 | RETIRED| 4205eb64de62343cbda4782790966c917fc37f20
0042 | M. Ibarra    | REDCIPHER-05 | RETIRED| b5f20208611c9ddc24829264ac29d7172d3e19530405fb85b4830ad8282feb1f5b5833701071fbc451d7a7da82b31571c2e99a2e0b6997ebf6740d07b0a0c936
0043 | S. Petrov    | PALEHORN-16  | ACTIVE | 8217dbe234c21d4798acaae872643435eead3b6e
0044 | K. Whitfield | SILENTOAK-28 | ACTIVE | 5916a427bc19850ce73e34301746cb28
0045 | C. Escobar   | DUSKRUNNER-07| KIA    | 42a31e15dcf0cd5b6588e4179fdf128c4d670cbffbac850a7081fb75377817cb557ab0b46f95f121770f0a64a5a10443b2bc3a9a45dfa5b75c99450c15a73f4a
0046 | Z. Kowalski  | IRONVEIL-12  | ACTIVE | 2ae08672b8301ced5dfcbc3f75e2190a832a5c52
0047 | [REDACTED]   | NIGHTFALL-07 | ACTIVE | 5dbf877e8070fc9b6fa1f479bbd69cc4087ce4b5c432c91326ec712c712a361e
0048 | T. Manning   | DUSKRUNNER-11| KIA    | 0d5d513a66d899731cf41b0d29f6306592f39cff82c5bcb5e18ee8781432bd71cdf7f92c143e556641d2d648a22cca8e0d3d443339bd8cff158c4c1ca71f8b0a
0049 | K. Farrow    | SILENTOAK-27 | RETIRED| 749ea8d26e6dfb1529c40566171e1b68
0050 | M. Solberg   | BLACKREED-17 | RETIRED| 07bfe5fbb58290c1567768d00f450789
0051 | Y. Callahan  | SILENTOAK-14 | RETIRED| e86e9c30b993f2a8a8896471ca40f98dcc16a7fb95593f485a27b79dab89e3f1
0052 | W. Reyes     | ASHFALL-20   | ACTIVE | 63c9d1446ade4a52fa5a10e8655f24ddcdfc016b0a60077b943c952199ead4afb65c07746053b1c8113013dec38f4609d384d33933f6686bd951f6fa70023f42
0053 | S. Kowalski  | DUSKRUNNER-29| ACTIVE | e98e13519bad331045abe82ba53cce8cfd534153
0054 | P. Ibarra    | ASHFALL-16   | KIA    | 5cb04ff3de128a07a3d7fbc4105ff52fa7a817cc72eee2fea3f03cd10296eab17eafbe3370ab9b315f4d38663c6e6a3d13ee4f01df5543cacd78ca9e44d9a666
0055 | V. Callahan  | SILENTOAK-22 | ACTIVE | 5a3bfd9d030c4116859841961be37c791ccda108
0056 | G. Holt      | BLACKREED-27 | ACTIVE | 669e52553c1d884580ae414a19fb2a7525dc2b76aab96f03be771ac3c890bef1
0057 | K. Manning   | IRONVEIL-11  | RETIRED| 350266d36d240ea122158278dcecda0c
0058 | X. Renner    | COLDFRONT-01 | KIA    | 12b39929ecc0f574c949b04310c296b6
0059 | P. Manning   | COLDFRONT-05 | ACTIVE | 786351e292836fab473926afea94bad50a77d8b4
0060 | X. Voss      | REDCIPHER-29 | RETIRED| eb9f35284682200c618f4bc794e2cb0754e554fb17f728b716bcfe11a3885ccb28c7cbbff04e57286455b37da3fff65d071454141585c0926eff57d4585ae27c
0061 | N. Okafor    | DUSKRUNNER-01| ACTIVE | 435f132f40ddb1d7fcb3d48f729d860030c6adb34d88db8c6df5bf89bc437e536ca15c024fd2287b21cc915fe06961751b70528cbcc60229bb876ec085d329a3
0062 | S. Nakamura  | COLDFRONT-27 | KIA    | ecf7aee0f382c77adb08792ca25fab6856f67786767b4332f01fbaf8f58c741d
0063 | R. Novak     | NIGHTFALL-17 | ACTIVE | 5e3ea006c3ab85878fab5fd6dbbc8e547387dc644f05df4af981c35168f3ea8bb8b0d3b659bafe2c9e45adc225a7aa98c8ebed550478265c332f10c23842c977
0064 | Z. Farrow    | BLACKREED-21 | ACTIVE | 501bafe8e45ed9bf72e9bd849004b9f0ff90d970
0065 | T. Vance     | IRONVEIL-14  | RETIRED| c75cc782d7898d625493ee8f6a041053984e07240f6ad9fbe1a2418c2f568c037ce716e36fc9a5138f96b1637da0583c701f4b275f2a11b434f7abe60cb481fe
0066 | T. Farrow    | COLDFRONT-23 | RETIRED| 5bae8524e98be0c50b7a2c6f49ada332145163f6
0067 | D. Haas      | ASHFALL-21   | RETIRED| 81b7206f2e1bdb1812926337c6675d3bed355ca5ebaabdda76c8beec0190490976a08431eb448b77892c62af5f391c21abdd370c191a4a741ce27d9c44a2f1c8
0068 | C. Achebe    | COLDFRONT-14 | MIA    | 4f6fc67728da23ddbb6ab095be4e176b42317490
0069 | L. Callahan  | DUSKRUNNER-10| RETIRED| 0a6668f40c18519681e02c8b309c7c3af256e0179afc50bbb97818c0874ac42c7d74d9ae4646494d45a235a40add9e846345087770b2f4fb5cff45671d08d766
0070 | C. Lindqvist | BLACKREED-28 | KIA    | ae7dc1cac13ee17c1c169ec99e5d914ee2354cdae05e6e28a5323eb2c5cc15a45451d99e95346080eff0f76fede207861541b1419a213d5595eb129abc2d29f4
0071 | D. Callahan  | SILENTOAK-11 | RETIRED| 66132f9da8b4fff5796030e36dd1ab60698299a03aac056aaff14f4eaed19a06ab2480ac5c539a18d2f7be96953b162e0f46af9a43461ec30912ae139096a669
0072 | J. Novak     | REDCIPHER-25 | RETIRED| 84583036ba8497529ae140f13c12dc5e
0073 | V. Vance     | SILENTOAK-11 | ACTIVE | e42e3e9ef7748bc5aaef02f3bfe59b43
0074 | N. Solberg   | DUSKRUNNER-11| RETIRED| 9ecd775fc2a6dda752f3ea3e59c23caf
0075 | W. Osei      | NIGHTFALL-03 | ACTIVE | 044e9ce66a99db20c491b10b3907dcacccd65f46
0076 | T. Achebe    | REDCIPHER-27 | RETIRED| 9440204fd424ded5edecb75d0f78db11fb3f248e
0077 | S. Kowalski  | COLDFRONT-29 | KIA    | 7f291a0fefadb9951981f51909f24288
0078 | E. Holt      | SILENTOAK-09 | ACTIVE | 354eb587f51a244fdc7e56b18315ecf9
0079 | R. Voss      | COLDFRONT-08 | RETIRED| f84d09eca13bd8a8838ce76a5a0020d33eb7986102163324c53589e2e8da85281cca1885e2f6c5f34d63e831228e0f401c84ac0ffdc270cf3ba9c12ba2e9651c
0080 | X. Duarte    | SILENTOAK-23 | RETIRED| bf2e641607fc29fe01a1a1c36e47214f
0081 | W. Escobar   | BLACKREED-30 | KIA    | 7405193e5233f726daca34a615a2384d
0082 | F. Callahan  | REDCIPHER-18 | ACTIVE | 7143c50f200529df4648ed7515f29bd07633b7e681634ff5511b96d8ae131550f327ead6a73a737d6c72ff1d46e5cb4e6b86a411843eed5a795572df6fe80d77
0083 | L. Torres    | ASHFALL-08   | KIA    | 0d11f1dcf3ef720d64b9720f95e0ee4c5be02ca1
0084 | K. Torres    | SILENTOAK-23 | KIA    | 2a1b13cbe1bb5264a73f67ab8d812bbef3f9eb26
0085 | Q. Kowalski  | DUSKRUNNER-13| ACTIVE | 235834f4609d4fbde096207adaafee949587fb914b9e5595545731a4e8b561ab
0086 | E. Vance     | BLACKREED-18 | ACTIVE | 30cf4ea40a9f94ea3f14390c7eb2a1678602e2c6fa1bc4dbcb09bb9e26ede95d
0087 | Z. Manning   | PALEHORN-05  | KIA    | 469fa2c20d8d5e465c9f199fe700489f
0088 | D. Brandt    | SILENTOAK-14 | ACTIVE | 7038f2bfd8f3b08514ae4b518bdb19926535aa98b3b4049bfda5364763de2340fb9b4ea5903744794642d320fd16311f38129033665b0248bb572306695036fb
0089 | Y. Reyes     | GRAYWOLF-15  | KIA    | 5bcd67d3a3e34fb912af3c9e9e7d9d62
0090 | R. Osei      | REDCIPHER-06 | ACTIVE | 3ce234cc352b6a6c37df88cbfcf84e338ff740312f05ca4932fe69ff8a01d3ceacee11595fd49cf3fff51c8fcb9a1014bb0ac3dbbdb177792293a50a1edd80f0
0091 | L. Achebe    | ASHFALL-13   | ACTIVE | f36afa59bd6f269819c723a82fd6b299
0092 | P. Osei      | COLDFRONT-11 | ACTIVE | c8e505f6e8d16be4749dda26d89587c7346079efdd1658408851f012a92db2c47338f273aac7d643568ed81fb3adf784bfb901178c9b37ec0c8927965ead182f
0093 | R. Voss      | PALEHORN-30  | ACTIVE | 3582bdae015e40c69a23574daef485a962db5cc70072e6851cd842b530def376689fc4d6696d5d40987e7be20f4ac6cd82311a7fb108c9cb41585fae42ad483a
0094 | B. Okafor    | BLACKREED-28 | ACTIVE | d988ad5af4e1641751f85ed3f1ebfef343b269558605d27f3a093cb3a402efe8
0095 | V. Osei      | NIGHTFALL-11 | ACTIVE | a4619a12c2c857c2065cc9439fd94b3b6fecf8d2db5dd21ae74f29ed2f94497d91213dd3e8b8203e55c12d9aee8a565283d00c305fecf9bc92440630606f47d6
0096 | C. Farrow    | BLACKREED-05 | RETIRED| 0354eff0e769c1a03ddf91fcff710da28df3fbed0596fbe77ae49cdbf5692f4565f3df97610b8b5512ad3737f8ab18431ee33313536b59ef34ba436ed07fa952
0097 | J. Vance     | PALEHORN-12  | KIA    | 4d74dddeb0e4022aac5d1c1419dc9ab084ce6ebc
0098 | G. Manning   | SILENTOAK-03 | ACTIVE | c49629a500879d31b8b313e90ea77b994c73a6be34dd221d4f6e2bcc8fdefd54
0099 | S. Okafor    | BLACKREED-23 | RETIRED| 36ef15b3d33b9143b9b99f044d19965f03b21df9
0100 | U. Whitfield | REDCIPHER-26 | RETIRED| 44eee4a2dc7ca1e8250932616f0350867e2ac1f0ad5d0ac823359458249d51a5019c3a4da8c31677fc381aed2f0d7083749de264b57de10e9501f88cb6915292`,
        },
        // Decoys: visible under plain ls, no puzzle value, realistic dead
        // ends. The two "binary" files never show content at all
        // (TerminalFile.isBinary, records_terminal puzzle follow-up); their
        // own content strings are placeholders, never actually displayed.
        {
          name: "legacy_auth.dll",
          isBinary: true,
          content: "[binary data]",
        },
        {
          name: "keystore.dat",
          isBinary: true,
          content: "[binary data]",
        },
        {
          name: "netmap.xml",
          content: `<network>
  <segment id="12" vlan="440" gateway="10.4.0.1"/>
  <segment id="13" vlan="441" gateway="10.4.0.1"/>
</network>`,
        },
      ],
      directories: [],
    },
  },
];
