# Podman Example
This directory contains an example of how to use a rootless Podman pod defined through Quadlets to run erblore.

# Setup
1. Copy the files in this directory to a suitable location on your system.
  - For many systems Quadlet monitors `~/.config/containers/systemd`
    - `mkdir -p ~/.config/containers/systemd && cp ./*lore* ~/.config/containers/systemd/`
2. Edit the `erblore.container` to set the correct mounts for `bookdrop` and your library
3. Create the Podman Secrets for the database
   ```bash
   echo -n "YOUR PASSWORD" | podman secret create erblore_db_pass -
   ```
4. (Optional) `podman pull ghcr.io/erblore/erblore:latest` to pre-pull the image
  * If you have a slow connection, this is recommended because systemd will time out if the image pull takes too long.
5. Run `systemctl --user daemon-reload` to pick up the new Quadlet unit.
6. Start the pod with `systemctl --user start erblore-pod.service`

# Autoupdates
If automatic updates are desired, enable the systemd timer:
```bash
systemctl --user enable podman-auto-update.timer
```

This is a native way to schedule `podman auto-update` to run periodically and update/restart containers with `AutoUpdate` enabled in their Quadlet files.

# Verification Commands
- `systemctl --user status erblore-pod -l` - Check the status of the pod
- `systemctl --user status erblore-db -l` - Check the status of the database
- `systemctl --user status erblore -l` - Check the status of the erblore container


# Further Reading
- [Podman Quadlets Documentation](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
- [Bazzite Podamn Quadlet Examples](https://docs.bazzite.gg/Installing_and_Managing_Software/Quadlet/)
- `man podman-systemd.unit`
