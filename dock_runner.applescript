-- Opens two Terminal windows:
-- 1) Run youtube_uploader
-- 2) Commit & push changes in puccibets.github.io (only if there are changes)
tell application "Terminal"
    do script "cd ~/puccibets/youtube_uploader; python3 youtube_uploader.py"
    do script "cd ~/puccibets/puccibets.github.io; git fetch --prune; git status --short; git pull --rebase --autostash; git status --short; if [ -n \"$(git status --porcelain)\" ]; then git add -A; git commit -m 'Auto update from dock shortcut'; fi; git push"
end tell
