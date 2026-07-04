import subprocess, sys

media_json = sys.argv[1]
chat_id = sys.argv[2]
bot_token = sys.argv[3]
files = sys.argv[4:]

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
