import { useEffect, useState } from "react"
import { DialRoot } from "dialkit"

const mobileDrivingQuery = "(hover: none), (pointer: coarse)"

export function ResponsiveDialRoot() {
  const [mobile, setMobile] = useState(() => window.matchMedia(mobileDrivingQuery).matches)

  useEffect(() => {
    const query = window.matchMedia(mobileDrivingQuery)
    const update = () => setMobile(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return <DialRoot position={mobile ? "top-right" : "bottom-right"} defaultOpen={false} theme="dark" productionEnabled />
}
