import subprocess, sys, json

json_file = sys.argv[1]
chat_id = sys.argv[2]
bot_token = sys.argv[3]
files = sys.argv[4:]

with open(json_file) as fp:
    media_json = fp.read().strip()

cmd = [
    "curl", "-s", "-X", "POST",
    "http://localhost:8081/bot" + bot_token + "/sendMediaGroup",
    "-F", "chat_id=" + chat_id,
]
for f in files:
    cmd.extend(["-F", "media=@" + f])
cmd.extend(["-F", "media=" + media_json])

r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr, file=sys.stderr)
