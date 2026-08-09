#!/usr/bin/env bash
# End-to-end API + page checks against a running server.
BASE=${BASE:-http://localhost:3000}
pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got '$2', want '$3')"; fi; }

jqv(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
code(){ curl -s -o /tmp/body -w '%{http_code}' "$@"; }

newgame(){ curl -s -X POST $BASE/api/games -H 'Content-Type: application/json' \
  -d "{\"whitePlayerName\":\"$1\",\"blackPlayerName\":\"$2\",\"timeControl\":${3:-600}}" | jqv '["game"]["id"]'; }
mv_(){ code -X POST $BASE/api/games/$1/moves -H 'Content-Type: application/json' \
  -d "{\"from\":\"$2\",\"to\":\"$3\",\"playerColor\":\"$4\"${5:+,\"promotion\":\"$5\"}}"; }
act(){ code -X POST $BASE/api/games/$1/actions -H 'Content-Type: application/json' \
  -d "{\"action\":\"$2\",\"color\":\"$3\"}"; }

echo "=== 1. Pages render ==="
for p in / /games; do check "GET $p" "$(code $BASE$p)" 200; done
G=$(newgame PageW PageB); check "GET /game/<id>" "$(code $BASE/game/$G)" 200
check "GET /game/<bogus> still renders" "$(code $BASE/game/zzzzzz)" 200
check "GET /api/health" "$(code $BASE/api/health)" 200

echo "=== 2. Illegal / malformed moves are rejected ==="
G=$(newgame IllW IllB)
check "king teleport e1->h8"      "$(mv_ $G e1 h8 w)" 422
check "moving empty square e5->e6" "$(mv_ $G e5 e6 w)" 422
check "pawn 3 squares e2->e5"      "$(mv_ $G e2 e5 w)" 422
check "black moves out of turn"    "$(mv_ $G e7 e5 b)" 409
check "malformed square 'zz'"      "$(mv_ $G zz e4 w)" 400
check "bad promotion piece"        "$(mv_ $G e2 e4 w K)" 400
FEN=$(curl -s $BASE/api/games/$G | jqv '["game"]["fen"]')
check "position untouched by rejects" "$FEN" "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

echo "=== 3. Result cannot be forged (old PATCH hole) ==="
check "PATCH status is gone" "$(code -X PATCH $BASE/api/games/$G -H 'Content-Type: application/json' -d '{"status":"finished","winner":"w"}')" 405
check "resign needs a color" "$(code -X POST $BASE/api/games/$G/actions -H 'Content-Type: application/json' -d '{"action":"resign"}')" 400
check "unknown action rejected" "$(act $G nuke w)" 400

echo "=== 4. Fool's mate => real checkmate detection ==="
M=$(newgame MateW MateB)
mv_ $M f2 f3 w >/dev/null; mv_ $M e7 e5 b >/dev/null
mv_ $M g2 g4 w >/dev/null; mv_ $M d8 h4 b >/dev/null
R=$(curl -s $BASE/api/games/$M)
check "status"     "$(echo "$R" | jqv '["game"]["status"]')"    finished
check "winner"     "$(echo "$R" | jqv '["game"]["winner"]')"    b
check "endReason"  "$(echo "$R" | jqv '["game"]["endReason"]')" checkmate
check "pgn"        "$(echo "$R" | jqv '["game"]["pgn"]')"       "1. f3 e5 2. g4 Qh4#"
check "move after mate refused" "$(mv_ $M a2 a3 w)" 409

echo "=== 5. Castling, en passant, promotion over the wire ==="
C=$(newgame CastW CastB)
for m in "e2 e4 w" "e7 e5 b" "g1 f3 w" "b8 c6 b" "f1 c4 w" "f8 c5 b"; do set -- $m; mv_ $C $1 $2 $3 >/dev/null; done
check "white O-O accepted" "$(mv_ $C e1 g1 w)" 201
check "SAN recorded as O-O" "$(curl -s $BASE/api/games/$C | jqv '["moves"][-1]["san"]')" "O-O"

P=$(newgame PromW PromB)
for m in "a2 a4 w" "b7 b5 b" "a4 b5 w" "b8 c6 b" "b5 b6 w" "c6 d4 b" "b6 b7 w" "d4 c6 b"; do set -- $m; mv_ $P $1 $2 $3 >/dev/null; done
check "promote b7->a8=Q (capture)" "$(mv_ $P b7 a8 w Q)" 201
check "SAN has =Q" "$(curl -s $BASE/api/games/$P | jqv '["moves"][-1]["san"]')" "bxa8=Q"

E=$(newgame EpW EpB)
for m in "e2 e4 w" "a7 a6 b" "e4 e5 w" "d7 d5 b"; do set -- $m; mv_ $E $1 $2 $3 >/dev/null; done
check "en passant e5xd6 accepted" "$(mv_ $E e5 d6 w)" 201
check "flagged as en passant" "$(curl -s $BASE/api/games/$E | jqv '["moves"][-1]["enPassant"]')" "True"

echo "=== 6. Draw offers require agreement ==="
D=$(newgame DrawW DrawB)
check "white offers"          "$(act $D offer-draw w)" 200
check "offer recorded"        "$(curl -s $BASE/api/games/$D | jqv '["game"]["drawOfferedBy"]')" w
check "white can't self-accept" "$(act $D accept-draw w)" 409
check "still playing"         "$(curl -s $BASE/api/games/$D | jqv '["game"]["status"]')" playing
check "black declines"        "$(act $D decline-draw b)" 200
check "offer cleared"         "$(curl -s $BASE/api/games/$D | jqv '["game"]["drawOfferedBy"]')" None
act $D offer-draw w >/dev/null
check "black accepts"         "$(act $D accept-draw b)" 200
check "game drawn"            "$(curl -s $BASE/api/games/$D | jqv '["game"]["winner"]')" draw

echo "=== 7. Resignation + Elo ratings ==="
R1=$(newgame EloWhite EloBlack)
act $R1 resign b >/dev/null
RES=$(curl -s $BASE/api/games/$R1)
check "winner is white" "$(echo "$RES" | jqv '["game"]["winner"]')" w
check "reason"          "$(echo "$RES" | jqv '["game"]["endReason"]')" resignation
check "white rating up"   "$(curl -s "$BASE/api/users?username=EloWhite" | jqv '["user"]["rating"]')" 1516
check "black rating down" "$(curl -s "$BASE/api/users?username=EloBlack" | jqv '["user"]["rating"]')" 1484
check "white win counted" "$(curl -s "$BASE/api/users?username=EloWhite" | jqv '["user"]["wins"]')" 1
check "double resign is a no-op" "$(act $R1 resign b)" 409
check "rating unchanged after"   "$(curl -s "$BASE/api/users?username=EloWhite" | jqv '["user"]["rating"]')" 1516

echo "=== 8. Server-side clocks ==="
T=$(newgame ClockW ClockB 60)
sleep 3
CW=$(curl -s $BASE/api/games/$T | jqv '["game"]["whiteTimeRemaining"]')
CB=$(curl -s $BASE/api/games/$T | jqv '["game"]["blackTimeRemaining"]')
if [ "$CW" -le 58 ] && [ "$CW" -ge 55 ]; then ok "white clock burned down ($CW)"; else bad "white clock ($CW)"; fi
check "black clock idle" "$CB" 60

echo "=== 9. Timeout is enforced ==="
F=$(newgame FlagW FlagB 30)
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -q -c \
  "UPDATE games SET white_time_remaining=1, last_move_at=now() - interval '10 seconds' WHERE id='$F'" >/dev/null 2>&1
RES=$(curl -s $BASE/api/games/$F)
check "flag fall auto-settled" "$(echo "$RES" | jqv '["game"]["status"]')" finished
check "black wins on time"     "$(echo "$RES" | jqv '["game"]["winner"]')" b
check "reason timeout"         "$(echo "$RES" | jqv '["game"]["endReason"]')" timeout

echo "=== 10. Validation & filters ==="
check "reject 5s time control" "$(code -X POST $BASE/api/games -H 'Content-Type: application/json' -d '{"timeControl":5}')" 400
check "reject missing body"    "$(code -X POST $BASE/api/games -H 'Content-Type: application/json' -d '{}')" 400
check "404 unknown game"       "$(code $BASE/api/games/nope123)" 404
check "live filter works"      "$(curl -s "$BASE/api/games?status=playing&limit=50" | python3 -c 'import sys,json;g=json.load(sys.stdin)["games"];print(len([x for x in g if x["status"]!="playing"]))')" 0
check "finished filter works"  "$(curl -s "$BASE/api/games?status=finished&limit=50" | python3 -c 'import sys,json;g=json.load(sys.stdin)["games"];print(len([x for x in g if x["status"]!="finished"]))')" 0
S=$(newgame SameName SameName)
check "same name => distinct players" "$(curl -s $BASE/api/games/$S | python3 -c 'import sys,json;d=json.load(sys.stdin)["game"];print(d["whitePlayerName"]!=d["blackPlayerName"])')" True

echo "=== 11. Threefold repetition ==="
TR=$(newgame RepW RepB)
for m in "g1 f3 w" "g8 f6 b" "f3 g1 w" "f6 g8 b" "g1 f3 w" "f6 g8 b"; do :; done
for m in "g1 f3 w" "g8 f6 b" "f3 g1 w" "f6 g8 b" "g1 f3 w" "g8 f6 b" "f3 g1 w"; do set -- $m; mv_ $TR $1 $2 $3 >/dev/null; done
check "not yet drawn (2 occurrences)" "$(curl -s $BASE/api/games/$TR | jqv '["game"]["status"]')" playing
mv_ $TR f6 g8 b >/dev/null
RES=$(curl -s $BASE/api/games/$TR)
check "drawn on 3rd occurrence" "$(echo "$RES" | jqv '["game"]["status"]')" finished
check "reason is repetition"    "$(echo "$RES" | jqv '["game"]["endReason"]')" "threefold repetition"
check "result is a draw"        "$(echo "$RES" | jqv '["game"]["winner"]')" draw

echo "=== 12. Spectator & review data ==="
SP=$(newgame SpecW SpecB)
mv_ $SP e2 e4 w >/dev/null; mv_ $SP e7 e5 b >/dev/null
check "spectator sees moves"  "$(curl -s $BASE/api/games/$SP | jqv '["moves"].__len__()')" 2
check "ratings exposed"       "$(curl -s $BASE/api/games/$SP | jqv '["players"]["white"]["rating"]')" 1500
check "turn is derived"       "$(curl -s $BASE/api/games/$SP | jqv '["game"]["turn"]')" w
check "spectator page renders" "$(code $BASE/game/$SP)" 200

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
