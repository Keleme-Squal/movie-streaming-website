import { useEffect, useRef, useState } from 'react'

// WebTorrent is the library that lets a browser download a torrent and play
// it. We load it from a CDN the first time a player opens, so there is
// nothing to npm install.
const WEBTORRENT_SRC = 'https://cdn.jsdelivr.net/npm/webtorrent@1.9.7/webtorrent.min.js'

// If we haven't found anyone sharing the movie after this long, give up
// and tell the viewer instead of spinning forever.
const NO_PEERS_TIMEOUT_MS = 25000

let scriptPromise = null

function loadWebTorrent() {
  if (window.WebTorrent) return Promise.resolve(window.WebTorrent)

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = WEBTORRENT_SRC
      script.onload = () => resolve(window.WebTorrent)
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load the torrent player library.'))
      }
      document.head.appendChild(script)
    })
  }

  return scriptPromise
}

export function TorrentVideo({ magnetUri, poster }) {
  const videoRef = useRef(null)
  const [state, setState] = useState({ phase: 'connecting', message: '' })
  const [stats, setStats] = useState({ peers: 0, progress: 0 })

  useEffect(() => {
    if (!magnetUri) return undefined

    let cancelled = false
    let client = null
    let timeoutId = null
    let intervalId = null
    let gotMetadata = false

    setState({ phase: 'connecting', message: 'Connecting to peers…' })
    setStats({ peers: 0, progress: 0 })

    const fail = (message) => {
      if (cancelled) return
      setState({ phase: 'error', message })
    }

    loadWebTorrent()
      .then((WebTorrent) => {
        if (cancelled) return

        client = new WebTorrent()
        client.on('error', (err) => fail(err.message || 'Torrent error.'))

        client.add(magnetUri, (torrent) => {
          // This runs once we have found a peer and received the torrent's
          // file list.
          gotMetadata = true
          if (cancelled) return

          const file = torrent.files.find((f) => /\.(mp4|webm|m4v)$/i.test(f.name))
          if (!file) {
            fail('This torrent has no .mp4 or .webm video the browser can play.')
            return
          }

          setState({ phase: 'buffering', message: 'Buffering…' })

          file.renderTo(videoRef.current, { autoplay: false, controls: true }, (err) => {
            if (err) {
              fail(err.message || 'Could not play this video.')
            } else if (!cancelled) {
              setState({ phase: 'playing', message: '' })
            }
          })
        })

        intervalId = setInterval(() => {
          const torrent = client && client.torrents[0]
          if (torrent) {
            setStats({ peers: torrent.numPeers, progress: torrent.progress })
          }
        }, 1000)

        timeoutId = setTimeout(() => {
          if (!gotMetadata) {
            fail(
              'No one is sharing this movie right now. Make sure the seeder is running, then try again.'
            )
          }
        }, NO_PEERS_TIMEOUT_MS)
      })
      .catch((err) => fail(err.message))

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      if (client) client.destroy()
    }
  }, [magnetUri])

  if (!magnetUri) {
    return (
      <div className="torrent-status" role="status">
        <p>No video has been added for this movie yet.</p>
      </div>
    )
  }

  const showOverlay = state.phase !== 'playing'

  return (
    <>
      <video
        ref={videoRef}
        className="player-video"
        poster={poster}
        controls
        playsInline
      />
      {showOverlay ? (
        <div className="torrent-status" role="status">
          <p>{state.message}</p>
          {state.phase !== 'error' ? (
            <small>
              {stats.peers} peer{stats.peers === 1 ? '' : 's'} · {Math.round(stats.progress * 100)}% downloaded
            </small>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
