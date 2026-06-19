from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


TESTS: list[dict[str, Any]] = [
    {
        "id": "T01",
        "location": "Hermosa Beach, California",
        "turns": [
            "Run the Hermosa Beach, CA example",
            "Change the colormap to Turbo and show current arrows",
            "Pause the sim",
            "Resume the sim",
            "What are the current wave parameters?",
            "Turn on sediment transport with D50 0.3 mm, porosity 0.4, and specific gravity 2.65.",
            "Add one wave gauge near the pier.",
            "Set the time series duration to 180 seconds.",
            "What are the current sediment and time series settings?",
        ],
    },
    {
        "id": "T02",
        "location": "Santa Cruz Harbor, California",
        "turns": [
            "Create a DEM for Santa Cruz Harbor, centered on the shoreline near the harbor, with a domain size of 2 km by 2 km. Then create CELERIS inputs. Waves coming from the west. Run the simulation.",
            "Change the plot to bathymetry/topography and use the Bathy/Topo colorbar.",
            "Use two wave gauges. Put gauge 1 at x=600 m, y=900 m and prepare gauge 2 for right-click placement near the harbor mouth.",
        ],
    },
    {
        "id": "T03",
        "location": "La Jolla, California",
        "turns": [
            "create a 2 km tall by 1 km wide DEM of the beach in La Jolla, near Scripps Pier. Then create the Celeris input files. Waves coming from the west. Run the sim.",
            "Set the color axis from -2 to 2 and show fluid speed.",
            "Enable sediment transport and plot depth change due to sediment transport.",
            "Add three time series gauges across the surf zone and set the time series length to 240 seconds.",
        ],
    },
    {
        "id": "T04",
        "location": "Oceanside Harbor, California",
        "turns": [
            "Create a coastal DEM for oceanside harbor in CA. target 1 km by 2 km domain. center at the entrance of the harbor. make inputs with waves from southwest and run it.",
            "set the incident wave to a single harmonic, with H of 1 m, Tp of 25 sec, and angle of -20",
            "what are the current wave parameters",
            "Use 0.2 mm sediment with critical Shields 0.045, and turn sediment transport on.",
            "Use 2 wave gauges; set gauge 1 at x=250 m, y=400 m and gauge 2 at x=750 m, y=1400 m.",
        ],
    },
    {
        "id": "T05",
        "location": "New River Inlet, North Carolina",
        "turns": [
            "Create a coastal DEM for New River inlet. target 2 km by 2 km domain. Center it at the mouth of New River Inlet where it enters the ocean.",
            "Create the CELERIS input files. Waves from the east. Use periodic boundary conditions on the north and south boundaries.",
            "Run the simulation.",
        ],
    },
    {
        "id": "T06",
        "location": "Duck, North Carolina",
        "turns": [
            "Build a 1.5 km by 1.5 km DEM around the Duck NC pier / field research site, centered on the shoreline. Generate CELERIS inputs with waves from the east and run it.",
            "Switch to significant wave height and use the Parula colormap.",
            "Turn sediment transport on and show sediment class 1 concentration.",
            "Add four wave gauges along a cross-shore transect near the pier.",
        ],
    },
    {
        "id": "T07",
        "location": "Destin, Florida",
        "turns": [
            "Lets create a new DEM for Destin, FL. The domain should extend about 300 m offshore to the south of the shoreline, and about 0.8 km east-west. Then create the Celeris inputs. Waves coming from 10 degrees east of south, with peak period 12 seconds and significant wave height 2 m. Use grid resolution 1 m north-south and 2 m east-west. Use periodic boundary conditions on west and east boundaries. Run the sim.",
            "Now turn on sediment transport, use 0.18 mm sand, and set porosity to 0.39.",
            "Add 3 time series points: one near the shoreline, one offshore, and one near the east boundary. Use a 5 minute duration.",
        ],
    },
    {
        "id": "T08",
        "location": "Port of Los Angeles, California",
        "turns": [
            "Create a DEM that covers the entire Port of LA.",
            "If the DEM request is large, ask me before downloading it.",
        ],
    },
    {
        "id": "T09",
        "location": "Pearl Harbor, Hawaii",
        "turns": [
            "Create a coastal DEM for Pearl Harbor in Hawaii. Target 2 km by 2 km domain, centered where the harbor meets the ocean.",
            "Generate the CELERIS input files. Use no incident wave forcing and NLSW mode.",
            "Run the simulation.",
        ],
    },
    {
        "id": "T10",
        "location": "Brookings Harbor, Oregon",
        "turns": [
            "create a domain similar size for Brookings Harbor in Oregon",
            "No, center on the harbor, not the town. The harbor is southeast of Brookings.",
            "Create inputs with waves from the west and run it.",
        ],
    },
    {
        "id": "T11",
        "location": "Newport / Yaquina Bay, Oregon",
        "turns": [
            "Make me a DEM for the entrance to Yaquina Bay at Newport Oregon, about 1.2 km by 1.2 km. Create inputs with waves from the west and launch Celeris.",
            "Make the running view explorer mode and use a more colorful colormap.",
            "Add sediment transport with specific gravity 2.65 and D50 of 0.35 mm.",
            "Add two wave gauges near the north and south jetties, then tell me the current time series settings.",
        ],
    },
    {
        "id": "T12",
        "location": "Galveston, Texas",
        "turns": [
            "Create a DEM for the Galveston ship channel entrance, roughly 2 km by 2 km. Set up waves from the southeast and run.",
            "Change the west boundary to a sponge layer and the waves to a TMA spectrum.",
            "Turn on sediment transport and set erosion psi to 0.0003.",
            "Use 5 wave gauges and set gauge 3 to x=1000 m, y=1000 m.",
        ],
    },
    {
        "id": "T13",
        "location": "Miami Government Cut, Florida",
        "turns": [
            "Can you set up Government Cut in Miami, centered where the channel opens to the ocean, 1 km by 1 km? waves coming in from the east. run the sim.",
            "Pause the sim and tell me the current state.",
            "Resume the sim, turn on sediment transport, and plot sediment class 1 erosion rate.",
            "Add a wave gauge at the channel entrance and another offshore.",
        ],
    },
    {
        "id": "T14",
        "location": "Morro Bay, California",
        "turns": [
            "Run the Morro Rock example",
            "What built-in example is running or queued?",
            "Turn on sediment transport with D50 0.25 mm.",
            "Add a time series gauge near Morro Rock.",
        ],
    },
    {
        "id": "T15",
        "location": "Marina del Rey, California",
        "turns": [
            "Create a coastal DEM for Marina del Rey Harbor. target 2 km by 2 km domain, centered at the entrance of the harbor. Then make inputs with waves from the west and run.",
            "Turn on the satellite map overlay and use Bathy/Topo.",
            "Turn sediment transport on and set critical Shields to 0.06.",
            "Use two time series gauges and set the plot duration to 300 seconds.",
        ],
    },
    {
        "id": "T16",
        "location": "Oregon Inlet, North Carolina",
        "turns": [
            "Create a 2 km square DEM for Oregon Inlet near Cape Hatteras, centered on the inlet mouth, not the state of Oregon. Use waves from the east and run Celeris.",
            "Set sediment d50 to 0.22 mm, porosity to 0.41, and turn sediment transport on.",
            "Add three gauges across the inlet mouth.",
        ],
    },
    {
        "id": "T17",
        "location": "San Juan Harbor, Puerto Rico",
        "turns": [
            "Create a DEM for the entrance to San Juan Harbor, Puerto Rico, 2 km by 2 km. If high-res US data is not available, use the best fallback.",
            "Create CELERIS inputs with waves from the north and run.",
        ],
    },
    {
        "id": "T18",
        "location": "Kablalan / southern Philippines earthquake source area",
        "turns": [
            "Create a DEM around the June 2026 Mw 7.8 earthquake in the Philippines. Center on the earthquake location and make the domain 4 degrees on a side. Use the etopo database.",
            "Find the earthquake parameters necessary to generate the tsunami initial condition. Use USGS finite fault information if available.",
            "Generate the CELERIS input files using the simplified single-rectangle average source. Use a 500 m grid size. Set the initial colorscale from -0.5 to 0.5.",
            "Run the sim.",
        ],
    },
    {
        "id": "T19",
        "location": "Crescent City Harbor, California",
        "turns": [
            "Create a DEM for Crescent City harbor, 3 km by 3 km, centered on the harbor entrance.",
            "Set this up as a tsunami-style run with no incoming boundary waves, NLSW mode, and sponge layers on every boundary.",
            "Run the simulation.",
        ],
    },
    {
        "id": "T20",
        "location": "Ventura Harbor / generic running example",
        "turns": [
            "Run the Ventura Harbor wind waves example.",
            "add a breakwater with crest elevation of 1m, crest width of , and side slope of 1/2",
            "crest width is 2 m",
            "Modify the DEM by increasing it on click by 0.5 m with lengthscale 20 m.",
            "Use these values.",
            "Turn on sediment transport and set the sediment plot to available sediment class 1 depth.",
            "Add two wave gauges, one inside the harbor and one outside the harbor.",
        ],
    },
    {
        "id": "T21",
        "location": "Duck, North Carolina / generic running example",
        "turns": [
            "Run the Duck NC example.",
            "Turn on sediment transport and use 0.25 mm sand with porosity 0.38 and specific gravity 2.65.",
            "Set critical Shields to 0.05 and erosion psi to 0.0002.",
            "What are the current sediment settings?",
            "Plot depth change due to sediment transport and use the Turbo colormap.",
            "Turn sediment transport off.",
            "Set up 4 time series gauges and use a 10 minute time series duration.",
            "What are the current time series settings?",
        ],
    },
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("--output", default="")
    parser.add_argument("--start", default="")
    parser.add_argument("--stop", default="")
    args = parser.parse_args()

    tests = filtered_tests(args.start, args.stop)
    started = datetime.now(timezone.utc)
    output = Path(args.output) if args.output else Path(__file__).with_name(f"conversation_regression_results_{started.strftime('%Y%m%d_%H%M%S')}.json")
    results: dict[str, Any] = {
        "started_at": started.isoformat(),
        "base_url": args.base_url,
        "suite": "conversation_regression_suite_20260611.md",
        "tests": [],
    }

    with requests.Session() as session:
        for test in tests:
            job_id = f"regression_{test['id'].lower()}_{started.strftime('%Y%m%d_%H%M%S')}"
            test_result = {
                "id": test["id"],
                "location": test["location"],
                "job_id": job_id,
                "turns": [],
            }
            print(f"\n=== {test['id']} {test['location']} ===", flush=True)
            for index, message in enumerate(test["turns"], start=1):
                turn_started = time.perf_counter()
                print(f"[{test['id']}.{index}] {message}", flush=True)
                try:
                    response = session.post(
                        f"{args.base_url.rstrip('/')}/api/chat",
                        data={"job_id": job_id, "message": message},
                        timeout=args.timeout,
                    )
                    elapsed = round(time.perf_counter() - turn_started, 3)
                    payload: dict[str, Any]
                    try:
                        payload = response.json()
                    except Exception:
                        payload = {"raw_text": response.text}
                    assistant_text = latest_assistant_text(payload)
                    state = payload.get("state") if isinstance(payload, dict) else {}
                    turn_result = {
                        "turn": index,
                        "message": message,
                        "status_code": response.status_code,
                        "elapsed_seconds": elapsed,
                        "assistant_text": assistant_text,
                        "workflow_state": (state or {}).get("workflow_state"),
                        "last_intent": (state or {}).get("last_intent"),
                        "selected_path": (state or {}).get("selected_path"),
                        "runtime_control": (state or {}).get("runtime_control"),
                        "runtime_state": (state or {}).get("runtime_state"),
                        "validation": (state or {}).get("validation"),
                        "artifacts": (state or {}).get("artifacts"),
                        "celeris_run": (state or {}).get("celeris_run"),
                        "state_summary": state_summary(state or {}),
                    }
                    print(f"  -> {response.status_code} {elapsed}s {turn_result['workflow_state']} :: {assistant_text[:180].replace(chr(10), ' ')}", flush=True)
                except Exception as exc:
                    elapsed = round(time.perf_counter() - turn_started, 3)
                    turn_result = {
                        "turn": index,
                        "message": message,
                        "error": str(exc),
                        "elapsed_seconds": elapsed,
                    }
                    print(f"  !! {elapsed}s {exc}", flush=True)
                test_result["turns"].append(turn_result)
                output.write_text(json.dumps(results | {"tests": [*results["tests"], test_result]}, indent=2), encoding="utf-8")
            results["tests"].append(test_result)

    results["finished_at"] = datetime.now(timezone.utc).isoformat()
    output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote {output}", flush=True)


def filtered_tests(start: str, stop: str) -> list[dict[str, Any]]:
    start = start.upper().strip()
    stop = stop.upper().strip()
    tests = TESTS
    if start:
        start_index = next((i for i, test in enumerate(tests) if test["id"] == start), 0)
        tests = tests[start_index:]
    if stop:
        stop_index = next((i for i, test in enumerate(tests) if test["id"] == stop), len(tests) - 1)
        tests = tests[: stop_index + 1]
    return tests


def latest_assistant_text(payload: dict[str, Any]) -> str:
    messages = payload.get("messages") or []
    for message in reversed(messages):
        if message.get("role") == "assistant":
            return str(message.get("text") or "")
    return ""


def state_summary(state: dict[str, Any]) -> dict[str, Any]:
    artifacts = state.get("artifacts") or []
    return {
        "workflow_state": state.get("workflow_state"),
        "last_intent": state.get("last_intent"),
        "artifact_types": [item.get("type") for item in artifacts],
        "has_runner": bool((state.get("celeris_run") or {}).get("runner_url")),
        "has_dem": any(item.get("type") == "celeris_bathy_mat" for item in artifacts),
        "has_config": any(item.get("type") == "celeris_config_json" for item in artifacts),
        "has_bathy_txt": any(item.get("type") == "celeris_bathy_txt" for item in artifacts),
    }


if __name__ == "__main__":
    main()
