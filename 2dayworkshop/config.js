/**
 * BDC '26 - Workshop Global Configuration
 * All schedule items, speakers, venue coordinates, and database settings are maintained here.
 */

window.WORKSHOP_CONFIG = {
  // Workshop Meta
  title: "Big Data Computing",
  edition: "2026",
  tagline: "GHRC · COMPUTING WORKSHOP 2026",
  dates: "14—15 November 2026",
  startDate: "2026-11-14T09:30:00+05:30",
  venueName: "G.H. Raisoni College of Engineering and Management (GHRCEMP)",
  venueCity: "Nagpur, Maharashtra",
  venueAddress: "B-37/39-1, Shradha Park, Hingna Road, MIDC, Nagpur, Maharashtra 440028",
  format: "Theory + lab practice",
  targetDomain: "@ghrcemp.raisoni.net",
  
  // Default Venue Geofence (Admin can update dynamically via Admin Dashboard)
  venueGeofence: {
    latitude: 21.0963, // GHRCEMP Nagpur approximate latitude
    longitude: 79.0042, // GHRCEMP Nagpur approximate longitude
    radiusMeters: 10 // Strict 10-meter geofence: <= 10m is GREEN (Verified), > 10m is RED (Flagged)
  },

  // Dynamic QR Code & Session Key Refresh Window (Rotates every 20 seconds)
  security: {
    codeSecret: "BDC_RAISONI_SECURE_2026_STREAM_KEY",
    refreshIntervalSeconds: 20, // Rotates every 20 seconds
    adminPasscode: "admin2026"
  },

  // Supabase Configuration (Replace with your own Supabase project details)
  supabase: {
    url: "https://your-project.supabase.co", // Replace with actual Supabase Project URL
    anonKey: "your-anon-key-here",          // Replace with public anon key
    enabled: false // When false, operates with high-fidelity local state & localStorage
  },

  // Speaker Data
  speakers: [
    {
      id: "priya-nair",
      roleBadge: "LEAD SPEAKER",
      name: "Dr. Priya Nair",
      designation: "Lead Data Platform Engineer · Industry Faculty",
      bio: "Builds distributed analytics systems and makes complex infrastructure feel practical, visual, and teachable. Former Distributed Systems Architect with 12+ years optimizing Petabyte-scale pipelines across Spark, Kafka, and Delta Lakehouse ecosystems.",
      image: "assets/speaker.png",
      linkedin: "https://linkedin.com",
      github: "https://github.com",
      topicBadges: ["Apache Spark", "Kafka Streaming", "Lakehouse Architecture", "PySpark"]
    }
  ],

  // Schedule Timeline Data (rendered dynamically)
  schedule: {
    day1: {
      label: "DAY 01 / SYSTEMS",
      theme: "Distributed Systems, Architecture & Apache Spark Core",
      date: "Saturday, November 14, 2026",
      sessions: [
        {
          id: "d1-m1",
          time: "09:30–11:15",
          title: "Module 1: Big Data Systems & Architectural Foundations",
          type: "theory", // "theory" or "lab"
          typeLabel: "THEORY",
          speaker: "Dr. Priya Nair",
          topics: [
            "Limits of RDBMS at petabyte scale; horizontal vs vertical scaling bottlenecks",
            "CAP Theorem in practice: Consistency vs Availability (WhatsApp vs ATM Banking tradeoffs)",
            "Data Lakes vs Data Warehouses vs Lakehouses architectural lineage",
            "HDFS fundamentals: NameNode/DataNode choreography, 128MB block splitting, Replication Factor = 3"
          ],
          activity: "Case-study walkthrough — deconstructing the Netflix recommendation pipeline architecture on the whiteboard.",
          studentTask: null
        },
        {
          id: "d1-break1",
          time: "11:15–11:30",
          title: "Tea & Networking Break",
          type: "break",
          typeLabel: "BREAK",
          topics: ["Informal networking, lab environment troubleshooting & morning refreshments."],
          activity: null,
          studentTask: null
        },
        {
          id: "d1-m2",
          time: "11:30–13:30",
          title: "Module 2: Apache Spark Core & Optimization Mechanics",
          type: "theory",
          typeLabel: "THEORY",
          speaker: "Dr. Priya Nair",
          topics: [
            "Why Spark beats Hadoop: in-memory computation model & up to 100x speedup",
            "Spark cluster architecture: Driver Program vs Cluster Manager vs Executor daemons",
            "RDD lineage vs DataFrames, Catalyst Optimizer, Lazy Evaluation & DAG physical plans",
            "Shuffle internals & optimization: narrow vs wide dependencies, broadcast joins, mitigation of data skew"
          ],
          activity: "Case study — how Uber computes dynamic surge pricing in real time using spatial partition analytics.",
          studentTask: null
        },
        {
          id: "d1-lunch",
          time: "13:30–14:15",
          title: "Lunch Break",
          type: "break",
          typeLabel: "BREAK",
          topics: ["Catered lunch at campus cafeteria."],
          activity: null,
          studentTask: null
        },
        {
          id: "d1-lab1",
          time: "14:15–16:15",
          title: "Hands-On Lab 1: High-Performance Analytics with PySpark",
          type: "lab",
          typeLabel: "HANDS-ON LAB",
          speaker: "Dr. Priya Nair & Workshop Lab Team",
          environment: "Google Colab (PySpark 3.5+)",
          topics: [
            "Setting up PySpark cluster session on Google Colab with optimized memory configs",
            "Load & inspect a 1,000,000-record synthetic banking transaction dataset",
            "Benchmarking standard shuffle join vs broadcast() join (observing runtime drop from ~15s to <1s)",
            "Real-world banking case study: applying PySpark Window Functions to flag velocity fraud (>3 transfers in 5 mins)"
          ],
          activity: "Live benchmarking in Colab notebook with real-time Spark execution UI inspections.",
          studentTask: "Fill in missing PySpark aggregation and windowing TODO snippets to complete the high-frequency fraud detection pipeline."
        }
      ]
    },
    day2: {
      label: "DAY 02 / STREAMING",
      theme: "Real-Time Streaming, Kafka & Cloud-Native Lakehouse",
      date: "Sunday, November 15, 2026",
      sessions: [
        {
          id: "d2-m3",
          time: "09:30–11:15",
          title: "Module 3: Real-Time Streaming & Apache Kafka Architecture",
          type: "theory",
          typeLabel: "THEORY",
          speaker: "Dr. Priya Nair",
          topics: [
            "Batch vs Real-Time Stream processing paradigms: latency vs throughput trade-offs",
            "Kafka core internals: Topics, Partitions, Offset commit management, Brokers, Producer/Consumer Groups",
            "Stream processing mechanics: Sliding vs Tumbling vs Session windows, Watermarking & late-arriving data",
            "Event-time vs Processing-time semantics in distributed message queues"
          ],
          activity: "Whiteboard architecture design — an event-driven clickstream pipeline for a Twitter/X live feed or IPL live scoreboard.",
          studentTask: null
        },
        {
          id: "d2-break1",
          time: "11:15–11:30",
          title: "Tea & Networking Break",
          type: "break",
          typeLabel: "BREAK",
          topics: ["Refreshments & Q&A on Kafka broker scaling."],
          activity: null,
          studentTask: null
        },
        {
          id: "d2-m4",
          time: "11:30–13:30",
          title: "Module 4: Cloud-Native Big Data & Data Lakehouse",
          type: "theory",
          typeLabel: "THEORY",
          speaker: "Dr. Priya Nair",
          topics: [
            "The Modern Data Stack: AWS S3 / MinIO object storage + Delta Lake / Apache Iceberg table formats",
            "Lakehouse superpowers: ACID transactions, Time Travel / version rollback, and schema enforcement",
            "Big data pipelines feeding production ML: Real-time feature stores & vector embedding stores",
            "Data Engineering Career Roadmap: Key skills, portfolio projects, open-source contributions & placement preparation"
          ],
          activity: "Interactive Q&A on hiring trends & interview problem archetypes for Data Engineers, ML Engineers, and Data Analysts.",
          studentTask: null
        },
        {
          id: "d2-lunch",
          time: "13:30–14:15",
          title: "Lunch Break",
          type: "break",
          typeLabel: "BREAK",
          topics: ["Lunch break & project prep."],
          activity: null,
          studentTask: null
        },
        {
          id: "d2-lab2",
          time: "14:15–16:15",
          title: "Hands-On Lab 2: Capstone Project — Real-Time Streaming Pipeline",
          type: "lab",
          typeLabel: "HANDS-ON LAB",
          speaker: "Dr. Priya Nair & Workshop Lab Team",
          environment: "Google Colab (PySpark Structured Streaming + Delta Lake)",
          topics: [
            "Simulating continuous streaming IoT sensor telemetry & financial ledger events",
            "Applying a 5-second tumbling window to compute real-time operational metrics & rolling averages",
            "Continuous stream processing sink into a persistent ACID Delta Lake storage layer with checkpointing",
            "Triggering automated anomaly alerts on telemetry spikes"
          ],
          activity: "Deploying end-to-end streaming sink and inspecting real-time Delta Lake table versions.",
          studentTask: "Complete the streaming sink logic to ingest live records, parse JSON schemas, and log threshold anomaly alerts."
        }
      ]
    }
  },

  // Lecture Notes & Resources
  notes: [
    {
      id: "note-1",
      day: "Day 1",
      session: "Module 1",
      title: "Big Data Systems & Architectural Foundations",
      speaker: "Dr. Priya Nair",
      type: "PDF / SLIDES",
      fileUrl: "#",
      updatedAt: "2026-11-14"
    },
    {
      id: "note-2",
      day: "Day 1",
      session: "Module 2",
      title: "Spark Core & Optimization Mechanics",
      speaker: "Dr. Priya Nair",
      type: "PDF / SLIDES",
      fileUrl: "#",
      updatedAt: "2026-11-14"
    },
    {
      id: "note-3",
      day: "Day 1",
      session: "Lab 1",
      title: "High-Performance Analytics with PySpark (Colab Notebook)",
      speaker: "Workshop Lab Team",
      type: "COLAB / CODE",
      fileUrl: "#",
      updatedAt: "2026-11-14"
    },
    {
      id: "note-4",
      day: "Day 2",
      session: "Module 3",
      title: "Real-Time Streaming & Kafka Architecture",
      speaker: "Dr. Priya Nair",
      type: "PDF / SLIDES",
      fileUrl: "#",
      updatedAt: "2026-11-15"
    },
    {
      id: "note-5",
      day: "Day 2",
      session: "Module 4",
      title: "Cloud-Native Data Lakehouse & Career Guide",
      speaker: "Dr. Priya Nair",
      type: "PDF / SLIDES",
      fileUrl: "#",
      updatedAt: "2026-11-15"
    },
    {
      id: "note-6",
      day: "Day 2",
      session: "Lab 2",
      title: "Real-Time Streaming Pipeline Capstone (Delta Lake Sink)",
      speaker: "Workshop Lab Team",
      type: "COLAB / CODE",
      fileUrl: "#",
      updatedAt: "2026-11-15"
    }
  ],

  // Frequently Asked Questions
  faqs: [
    {
      q: "Who is eligible to attend this workshop?",
      a: "This workshop is open to undergraduate and postgraduate students from GHRCEMP and affiliated institutes. Students with basic familiarity with Python, Java, or SQL and an interest in large-scale data engineering will benefit most."
    },
    {
      q: "Do I need prior Apache Spark or Kafka experience?",
      a: "No prior distributed systems experience is required. We start from ground-up architectural principles (RDBMS limits, HDFS, CAP theorem) and progress step-by-step into hands-on PySpark and Structured Streaming."
    },
    {
      q: "What software should I install on my laptop before arriving?",
      a: "All hands-on lab sessions run on Google Colab cloud runtime with pre-configured PySpark and Delta Lake environments. You only need a modern web browser (Chrome / Firefox / Edge), an active Google account, and your laptop charger."
    },
    {
      q: "How does the workshop attendance verification work?",
      a: "Attendance is strictly verified through high-precision GPS geofencing (10-meter radius around the workshop venue coordinates) and a dynamic QR code displayed on the hall projector that updates silently every 20 seconds. Attendees scan the live QR code from inside the 10m zone. Attendees within <= 10m are verified in GREEN, and anyone outside 10m is flagged in RED."
    },
    {
      q: "Will certificates of completion be issued?",
      a: "Yes, verified attendees who complete both hands-on lab modules and maintain valid check-in records across both days will receive an official Certificate of Completion in Big Data Computing."
    }
  ]
};
