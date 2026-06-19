import { timeSeriesData } from "./constants_load_calc.js";

const PLOT_QUANTITIES = {
    free_surface_elevation: { value: 0, label: "Free Surface Elevation (m)" },
    bathymetry_topography: { value: 6, label: "Bathymetry/Topography (m)" },
    bottom_friction_map: { value: 15, label: "Bottom Friction Map" },
    fluid_speed: { value: 1, label: "Fluid Speed (m/s)" },
    x_velocity: { value: 2, label: "East-West (x) Velocity (m/s)" },
    y_velocity: { value: 3, label: "North-South (y) Velocity (m/s)" },
    vertical_vorticity: { value: 4, label: "Vertical Vorticity (1/s)" },
    mean_abs_vertical_vorticity: { value: 23, label: "Mean |Vertical Vorticity| (1/s)" },
    foam_tracer_concentration: { value: 5, label: "Foam / Tracer Concentration" },
    mean_foam_tracer_concentration: { value: 11, label: "Mean Foam / Tracer Concentration" },
    max_free_surface_elevation: { value: 16, label: "Max Free Surface Elev (m)" },
    mean_free_surface_elevation: { value: 7, label: "Mean Free Surface Elev (m)" },
    mean_fluid_speed_magnitude: { value: 8, label: "Mean Fluid Speed [Magn] (m/s)" },
    mean_fluid_speed_x: { value: 9, label: "Mean Fluid Speed [E-W] (m/s)" },
    mean_fluid_speed_y: { value: 10, label: "Mean Fluid Speed [N-S] (m/s)" },
    rms_wave_height: { value: 12, label: "RMS Wave Height (m)" },
    significant_wave_height: { value: 13, label: "Significant Wave Height (m)" },
    baseline_hs_difference: { value: 14, label: "Difference from Baseline Hs (m)" },
    sediment_depth_change: { value: 21, label: "Depth Change due to Sed Transport" },
    sediment_class_1_concentration: { value: 17, label: "Sediment Class 1 Concentration" },
    sediment_class_1_erosion_rate: { value: 18, label: "Sediment Class 1 Erosion Rate" },
    sediment_class_1_available_depth: { value: 19, label: "Sediment Class 1 Available Depth" },
    design_component_map: { value: 22, label: "Design Component Map" },
};

const COLORMAPS = {
    ocean: { value: 0, label: "Ocean" },
    parula: { value: 1, label: "Parula" },
    turbo: { value: 2, label: "Turbo" },
    hsv: { value: 3, label: "HSV" },
    gray: { value: 4, label: "Gray" },
    pink: { value: 5, label: "Pink" },
    bathy_topo: { value: 6, label: "Bathy/Topo" },
};

const EXAMPLES = {
    ventura_harbor_ca_wind_waves: { value: 0, label: "Ventura Harbor (CA), wind waves" },
    hermosa_beach_ca_wind_waves: { value: 27, label: "Hermosa Beach (CA), wind waves" },
    hermosa_beach_ca_high_order: { value: 37, label: "Hermosa Beach (CA), High-Order mode" },
    balboa_pier_ca_wind_waves: { value: 25, label: "Balboa Pier (CA), wind waves" },
    newport_jetties_ca_wind_waves: { value: 20, label: "Newport Jetties (CA), wind waves" },
    oceanside_ca_wind_waves: { value: 33, label: "Oceanside (CA), wind waves" },
    blacks_beach_ca_wind_waves: { value: 26, label: "Blacks Beach (CA), wind waves" },
    scripps_pier_ca_wind_waves: { value: 18, label: "Scripps Pier (CA), wind waves" },
    scripps_canyon_ca_wind_waves: { value: 19, label: "Scripps Canyon (CA), wind waves" },
    morro_rock_ca_wind_waves: { value: 28, label: "Morro Rock (CA), wind waves" },
    santa_cruz_harbor_ca_wind_waves: { value: 1, label: "Santa Cruz Harbor (CA), wind waves" },
    mavericks_ca_wind_waves: { value: 23, label: "Mavericks (CA), wind waves" },
    pillar_point_harbor_ca_wind_waves: { value: 7, label: "Pillar Point Harbor (CA), wind waves" },
    pacifica_ca_wind_waves: { value: 29, label: "Pacifica (CA), wind waves" },
    newport_or_wind_waves: { value: 11, label: "Newport (OR), wind waves" },
    waimea_bay_hi_wind_waves: { value: 21, label: "Waimea Bay (HI), wind waves" },
    ipan_reef_guam_wind_waves: { value: 24, label: "Ipan Reef (Guam), wind waves" },
    frf_duck_nc_wind_waves: { value: 5, label: "FRF Duck (NC), wind waves" },
    sebastian_inlet_fl_wind_waves: { value: 42, label: "Sebastian Inlet (FL), wind waves" },
    miami_beach_fl_wind_waves: { value: 9, label: "Miami Beach (FL), wind waves" },
    miami_inlet_fl_wind_waves: { value: 10, label: "Miami Inlet (FL), wind waves" },
    tyndall_afb_fl_wind_waves: { value: 22, label: "Tyndall AFB (FL), wind waves" },
    hania_crete_harbor_wind_waves: { value: 8, label: "Hania (Crete) Harbor, wind waves" },
    santa_cruz_harbor_ca_tsunami: { value: 2, label: "Santa Cruz Harbor (CA), tsunami" },
    crescent_city_harbor_ca_tsunami: { value: 4, label: "Crescent City Harbor (CA), tsunami" },
    port_of_la_lb_ca_tsunami: { value: 12, label: "Port of LA/LB (CA), tsunami" },
    santa_barbara_ca_tsunami: { value: 13, label: "Santa Barbara (CA), tsunami" },
    tracy_arm_ak_tsunami: { value: 38, label: "Tracy Arm (AK), tsunami" },
    tracy_arm_ak_hot_start: { value: 39, label: "Tracy Arm (AK), hot start" },
    yakutat_bay_ak_tsunami: { value: 41, label: "Yakutat Bay (AK), tsunami" },
    taan_fjord_ak_tsunami: { value: 14, label: "Taan Fjord (AK), tsunami" },
    portage_lake_ak_tsunami: { value: 34, label: "Portage Lake (AK), tsunami" },
    portage_lake_and_river_ak_tsunami: { value: 40, label: "Portage Lake & River (AK), tsunami" },
    barry_arm_pws_ak_tsunami: { value: 3, label: "Barry Arm (PWS, AK), tsunami" },
    greenland_karrat_tsunami: { value: 6, label: "Greenland (Karrat), tsunami" },
    greenland_umanak_tsunami: { value: 35, label: "Greenland (Umanak), tsunami" },
    harrison_lake_bc_tsunami: { value: 31, label: "Harrison Lake (BC), tsunami" },
    san_francisco_bay_ca_tides: { value: 16, label: "San Francisco Bay (CA), tides" },
    osu_directional_wave_basin: { value: 15, label: "OSU Directional Wave Basin" },
    osu_seaside_experiments_2007: { value: 17, label: "OSU Seaside Experiments (2007)" },
    toy_problem_wind_waves: { value: 30, label: "Toy Problem, wind waves" },
};

const PAUSE_STATES = {
    pause: { value: 1, label: "Pause" },
    resume: { value: -1, label: "Resume" },
};

const TRANSPORT_OVERLAYS = {
    foam: { value: 1, label: "Show Areas of Foam" },
    none: { value: 0, label: "No Foam or Tracer" },
    passive_tracer: { value: 2, label: "Passive Tracer Conc" },
};

const MAP_OVERLAYS = {
    none: { value: 0, label: "No Overlay" },
    google_maps: { value: 1, label: "Include Google Maps Overlay" },
    satellite_aerial: { value: 2, label: "Include Satellite / Aerial Overlay" },
};

const VECTOR_ARROWS = {
    none: { value: 0, label: "No" },
    instantaneous_velocity: { value: 1, label: "Instantaneous Velocity Vectors" },
    time_averaged_velocity: { value: 2, label: "Time-Averaged Velocity Vectors" },
};

const LOGOS = {
    show: { value: 0, label: "Yes" },
    hide: { value: 1, label: "No" },
};

const VIEW_MODES = {
    design_2d: { value: 1, label: "-Design: 2D view, modify surfaces" },
    explorer_3d: { value: 2, label: "-Explorer: 3D view, fly-through scene" },
};

const DESIGN_COMPONENTS = {
    coral_reef: { value: 1, label: "Coral Reef", frictionProperty: "designcomponent_Fric_Coral" },
    oyster_bed: { value: 2, label: "Mussel/Oyster Bed", frictionProperty: "designcomponent_Fric_Oyser" },
    mangrove: { value: 3, label: "Mangrove", frictionProperty: "designcomponent_Fric_Mangrove" },
    kelp_bed: { value: 4, label: "Kelp Bed", frictionProperty: "designcomponent_Fric_Kelp" },
    grass: { value: 5, label: "Grass", frictionProperty: "designcomponent_Fric_Grass" },
    scrub: { value: 6, label: "Scrub", frictionProperty: "designcomponent_Fric_Scrub" },
    rubblemound_structure: { value: 7, label: "Rubblemound Structure", frictionProperty: "designcomponent_Fric_RubbleMound" },
};

const MOD_SURFACES = {
    bathy_topography: { value: 1, label: "Bathymetry/Topography (m)" },
    bottom_friction: { value: 2, label: "Bottom Friction" },
    passive_tracer_source: { value: 3, label: "Passive Tracer Sources" },
    water_surface_elevation: { value: 4, label: "Ocean Surface Elevation" },
};

const MOD_CHANGE_TYPES = {
    increase_decrease: { value: 1, label: "Increase/Decrease on Click" },
    set_value: { value: 2, label: "Set to Value on Click" },
};

const BOUNDARY_SIDES = {
    west: { property: "west_boundary_type", label: "West" },
    east: { property: "east_boundary_type", label: "East" },
    south: { property: "south_boundary_type", label: "South" },
    north: { property: "north_boundary_type", label: "North" },
};

const BOUNDARY_TYPES = {
    solid_wall: { value: 0, label: "Solid Wall" },
    sponge_layer: { value: 1, label: "Sponge Layer" },
    incident_waves: { value: 2, label: "Incident Waves" },
    periodic_boundary: { value: 3, label: "Periodic Boundary" },
};

const INCIDENT_WAVE_TYPES = {
    sine_wave: { value: 0, label: "Sine Wave (single harmonic)" },
    tma_spectrum: { value: 1, label: "TMA Spectrum" },
    transient_pulse: { value: 2, label: "Transient Pulse (4 waves)" },
    solitary_wave: { value: 3, label: "Solitary Wave" },
    custom_spectrum_file: { value: -1, label: "Custom Spectrum from loaded file" },
    time_series_file: { value: 5, label: "Time Series from loaded file" },
};

const SEDIMENT_TRANSPORT_STATES = {
    off: { value: 0, label: "No Sediment Transport" },
    on: { value: 1, label: "Include Sediment Transport" },
};

const MAX_TIME_SERIES_COUNT = 15;

const ENUM_COMMANDS = {
    "visualization.set_plot_quantity": { arg: "plot_quantity", property: "surfaceToPlot", values: PLOT_QUANTITIES },
    "visualization.set_colormap": { arg: "colormap", property: "colorMap_choice", values: COLORMAPS },
    "visualization.set_transport_overlay": { arg: "transport_overlay", property: "showBreaking", values: TRANSPORT_OVERLAYS },
    "visualization.set_map_overlay": { arg: "map_overlay", property: "GoogleMapOverlay", values: MAP_OVERLAYS },
    "visualization.set_vector_arrows": { arg: "vector_arrows", property: "ShowArrows", values: VECTOR_ARROWS },
    "visualization.set_logos": { arg: "logos", property: "ShowLogos", values: LOGOS },
    "visualization.set_view_mode": { arg: "view_mode", property: "viewType", values: VIEW_MODES },
    "simulation.set_pause": { arg: "pause_state", property: "simPause", values: PAUSE_STATES },
    "boundary.set_incident_wave_type": { arg: "incident_wave_type", property: "incident_wave_type", values: INCIDENT_WAVE_TYPES },
    "sediment.set_transport_model": { arg: "sediment_transport", property: "useSedTransModel", values: SEDIMENT_TRANSPORT_STATES },
};

const NUMERIC_COMMANDS = {
    "visualization.set_color_axis_max": { arg: "color_axis_max", property: "colorVal_max" },
    "visualization.set_color_axis_min": { arg: "color_axis_min", property: "colorVal_min" },
    "visualization.set_arrow_scale": { arg: "arrow_scale", property: "arrow_scale" },
    "visualization.set_arrow_density": { arg: "arrow_density", property: "arrow_density" },
    "sediment.set_d50_mm": { arg: "d50_mm", property: "sedC1_d50" },
    "sediment.set_porosity": { arg: "porosity", property: "sedC1_n" },
    "sediment.set_specific_gravity": { arg: "specific_gravity", property: "sedC1_denrat" },
    "sediment.set_erosion_psi": { arg: "erosion_psi", property: "sedC1_psi" },
    "sediment.set_critical_shields": { arg: "critical_shields", property: "sedC1_criticalshields" },
    "timeseries.set_count": { arg: "time_series_count", property: "NumberOfTimeSeries" },
    "timeseries.set_duration": { arg: "duration_s", property: "maxdurationTimeSeries" },
    "timeseries.select_location_index": { arg: "location_index", property: "changethisTimeSeries" },
};

const FULLSCREEN_STATES = {
    enter: { value: 1, label: "Full Screen" },
};

function commandId(namespace, action) {
    return `${namespace}.${action}`;
}

function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
}

function validLabels(map) {
    return Object.values(map).map((item) => item.label);
}

function installConsoleForwarding() {
    if (window.__celerisAgentConsoleForwardingInstalled) {
        return;
    }
    window.__celerisAgentConsoleForwardingInstalled = true;
    ["log", "info", "warn", "error"].forEach((level) => {
        const original = console[level]?.bind(console) || console.log.bind(console);
        console[level] = (...args) => {
            original(...args);
            try {
                window.parent?.postMessage(
                    {
                        type: "celeris-agent-console",
                        level,
                        message: args.map(formatConsoleArg).join(" "),
                    },
                    "*",
                );
            } catch {
                // Console forwarding is diagnostic only.
            }
        };
    });
    window.addEventListener("error", (event) => {
        window.parent?.postMessage(
            {
                type: "celeris-agent-console",
                level: "error",
                message: `${event.message || "Script error"}${event.filename ? ` (${event.filename}:${event.lineno || "?"})` : ""}`,
            },
            "*",
        );
    });
    window.addEventListener("unhandledrejection", (event) => {
        window.parent?.postMessage(
            {
                type: "celeris-agent-console",
                level: "error",
                message: `Unhandled promise rejection: ${formatConsoleArg(event.reason)}`,
            },
            "*",
        );
    });
}

function formatConsoleArg(value) {
    if (value instanceof Error) {
        return value.stack || value.message;
    }
    if (typeof value === "string") {
        return value;
    }
    if (value === undefined) {
        return "undefined";
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function installCelerisAgentControls({
    calcConstants,
    getCalcConstants,
    updateCalcConstants,
    updateAllUIElements,
    runExample,
    updateViewMode,
    exitFullscreenCleanup,
    setLinearStructureEndpointMode,
    setDesignInteractionMode,
    requestAddLinearStructure,
    postStatus,
}) {
    installConsoleForwarding();

    function currentCalcConstants() {
        return getCalcConstants?.() || calcConstants;
    }

    function enterDesignPanelMode() {
        if (updateViewMode) {
            updateViewMode(1);
        } else {
            updateCalcConstants("viewType", 1);
        }
        updateCalcConstants("whichPanelisOpen", 2);
        updateAllUIElements();
    }

    function enterModsPanelMode() {
        if (updateViewMode) {
            updateViewMode(1);
        } else {
            updateCalcConstants("viewType", 1);
        }
        updateCalcConstants("whichPanelisOpen", 3);
        setDesignInteractionMode?.(null);
        updateAllUIElements();
    }

    function enterTimeSeriesPanelMode() {
        if (updateViewMode) {
            updateViewMode(1);
        } else {
            updateCalcConstants("viewType", 1);
        }
        updateCalcConstants("whichPanelisOpen", 7);
        setDesignInteractionMode?.("timeseries");
        updateAllUIElements();
    }

    function normalizeTimeSeriesIndex(value, fallback = 1) {
        const numeric = Number(value);
        const base = Number.isFinite(numeric) ? numeric : fallback;
        return Math.min(MAX_TIME_SERIES_COUNT, Math.max(1, Math.round(base)));
    }

    function normalizeTimeSeriesCount(value, fallback = 1) {
        const numeric = Number(value);
        const base = Number.isFinite(numeric) ? numeric : fallback;
        return Math.min(MAX_TIME_SERIES_COUNT, Math.max(0, Math.round(base)));
    }

    function ensureTimeSeriesCountAtLeast(index) {
        const constants = currentCalcConstants();
        const current = normalizeTimeSeriesCount(constants.NumberOfTimeSeries, 0);
        if (current < index) {
            updateCalcConstants("NumberOfTimeSeries", index);
            constants.chartDataUpdate = 1;
        }
    }

    function applyEnumCommand(id, args = {}) {
        const definition = ENUM_COMMANDS[id];
        const key = normalizeKey(args[definition.arg]);
        const selected = definition.values[key];
        if (!selected) {
            throw new Error(`Unsupported ${definition.arg} '${args[definition.arg]}'.`);
        }
        if (id === "visualization.set_view_mode" && updateViewMode) {
            updateViewMode(selected.value);
        } else {
            updateCalcConstants(definition.property, selected.value);
            if (id === "visualization.set_map_overlay") {
                currentCalcConstants().OverlayUpdate = 1;
            }
            updateAllUIElements();
        }
        return {
            namespace: id.split(".")[0],
            action: id.split(".")[1],
            status: "applied",
            [definition.arg]: selected.label,
            [definition.property]: selected.value,
        };
    }

    function applyNumericCommand(id, args = {}) {
        const definition = NUMERIC_COMMANDS[id];
        const value = Number(args[definition.arg]);
        if (!Number.isFinite(value)) {
            throw new Error(`Unsupported ${definition.arg} '${args[definition.arg]}'.`);
        }
        updateCalcConstants(definition.property, value);
        updateAllUIElements();
        return {
            namespace: id.split(".")[0],
            action: id.split(".")[1],
            status: "applied",
            [definition.arg]: value,
            [definition.property]: value,
        };
    }

    function setSurfaceComponent(args = {}) {
        const key = normalizeKey(args.component);
        const selected = DESIGN_COMPONENTS[key];
        if (!selected) {
            throw new Error(`Unsupported design component '${args.component}'.`);
        }
        enterDesignPanelMode();
        setDesignInteractionMode?.("surface");
        updateCalcConstants("designcomponentToAdd", selected.value);
        const radius = Number(args.radius_m);
        if (args.radius_m !== null && args.radius_m !== undefined && Number.isFinite(radius)) {
            updateCalcConstants("designcomponent_Radius", radius);
        }
        const friction = Number(args.friction);
        if (args.friction !== null && args.friction !== undefined && Number.isFinite(friction)) {
            updateCalcConstants(selected.frictionProperty, friction);
        }
        updateAllUIElements();
        return {
            namespace: "design",
            action: "set_surface_component",
            status: "applied",
            component: selected.label,
            designcomponentToAdd: selected.value,
            radius_m: currentCalcConstants().designcomponent_Radius,
            friction: currentCalcConstants()[selected.frictionProperty],
        };
    }

    function prepareLinearStructure(args = {}) {
        const crestElevation = Number(args.crest_elevation_m);
        const crestWidth = Number(args.crest_width_m);
        const sideSlope = Number(args.side_slope);
        if (!Number.isFinite(crestElevation) || !Number.isFinite(crestWidth) || !Number.isFinite(sideSlope)) {
            throw new Error("Linear structures require crest_elevation_m, crest_width_m, and side_slope.");
        }
        if (crestWidth <= 0.0 || sideSlope <= 0.0) {
            throw new Error("Linear structure crest_width_m and side_slope must be positive.");
        }
        enterDesignPanelMode();
        setDesignInteractionMode?.("linear");
        updateCalcConstants("designcomponent_CrestElev", crestElevation);
        updateCalcConstants("designcomponent_CrestWidth", crestWidth);
        updateCalcConstants("designcomponent_SideSlope", sideSlope);
        if (setLinearStructureEndpointMode) {
            setLinearStructureEndpointMode(1);
        } else {
            updateCalcConstants("designcomponent_CurrentEndPoint", 1);
        }
        updateAllUIElements();
        return {
            namespace: "design",
            action: "prepare_linear_structure",
            status: "applied",
            structure_label: args.structure_label || "linear structure",
            crest_elevation_m: crestElevation,
            crest_width_m: crestWidth,
            side_slope: sideSlope,
            endpoint_mode: "start",
        };
    }

    function confirmLinearStart() {
        enterDesignPanelMode();
        setDesignInteractionMode?.("linear");
        if (setLinearStructureEndpointMode) {
            setLinearStructureEndpointMode(2);
        } else {
            updateCalcConstants("designcomponent_CurrentEndPoint", 2);
        }
        updateAllUIElements();
        return {
            namespace: "design",
            action: "confirm_linear_start",
            status: "applied",
            endpoint_mode: "end",
        };
    }

    function confirmLinearEndAndAdd() {
        enterDesignPanelMode();
        setDesignInteractionMode?.("linear");
        const result = requestAddLinearStructure?.({ silent: true });
        if (result && result.ok === false) {
            throw new Error(result.message || "Unable to add the linear structure.");
        }
        updateAllUIElements();
        return {
            namespace: "design",
            action: "confirm_linear_end_and_add",
            status: "applied",
            structure_added: true,
        };
    }

    function activateModsClickEdit(args = {}) {
        const surfaceKey = normalizeKey(args.surface || "bathy_topography");
        const changeModeKey = normalizeKey(args.change_mode || "increase_decrease");
        const selectedSurface = MOD_SURFACES[surfaceKey];
        const selectedChangeMode = MOD_CHANGE_TYPES[changeModeKey];
        if (!selectedSurface) {
            throw new Error(`Unsupported mods surface '${args.surface}'.`);
        }
        if (!selectedChangeMode) {
            throw new Error(`Unsupported mods change mode '${args.change_mode}'.`);
        }
        enterModsPanelMode();
        updateCalcConstants("surfaceToChange", selectedSurface.value);
        updateCalcConstants("changeType", selectedChangeMode.value);
        const amount = Number(args.amount);
        if (args.amount !== null && args.amount !== undefined && Number.isFinite(amount)) {
            updateCalcConstants("changeAmplitude", amount);
        }
        const radius = Number(args.radius_m);
        if (args.radius_m !== null && args.radius_m !== undefined && Number.isFinite(radius)) {
            updateCalcConstants("changeRadius", radius);
        }
        updateAllUIElements();
        return {
            namespace: "mods",
            action: "activate_click_edit",
            status: "applied",
            surface: selectedSurface.label,
            surfaceToChange: selectedSurface.value,
            change_mode: selectedChangeMode.label,
            changeType: selectedChangeMode.value,
            amount: currentCalcConstants().changeAmplitude,
            radius_m: currentCalcConstants().changeRadius,
        };
    }

    function setBoundaryType(args = {}) {
        const sideKey = normalizeKey(args.side);
        const typeKey = normalizeKey(args.boundary_type);
        const selectedSide = BOUNDARY_SIDES[sideKey];
        const selectedType = BOUNDARY_TYPES[typeKey];
        if (!selectedSide) {
            throw new Error(`Unsupported boundary side '${args.side}'.`);
        }
        if (!selectedType) {
            throw new Error(`Unsupported boundary type '${args.boundary_type}'.`);
        }
        updateCalcConstants(selectedSide.property, selectedType.value);
        updateAllUIElements();
        return {
            namespace: "boundary",
            action: "set_boundary_type",
            status: "applied",
            side: selectedSide.label,
            boundary_type: selectedType.label,
            [selectedSide.property]: selectedType.value,
        };
    }

    function setIncidentWaveParameters(args = {}) {
        const updates = [];
        const updateNumber = (argName, property) => {
            if (args[argName] === null || args[argName] === undefined || args[argName] === "") {
                return;
            }
            const value = Number(args[argName]);
            if (!Number.isFinite(value)) {
                throw new Error(`Unsupported ${argName} '${args[argName]}'.`);
            }
            updateCalcConstants(property, value);
            updates.push({ argName, property, value });
        };
        updateNumber("height_m", "incident_wave_H");
        updateNumber("period_s", "incident_wave_T");
        updateNumber("direction_deg", "incident_wave_direction");
        if (!updates.length) {
            throw new Error("At least one incident wave parameter is required.");
        }
        updateAllUIElements();
        return {
            namespace: "boundary",
            action: "set_incident_wave_parameters",
            status: "applied",
            height_m: currentCalcConstants().incident_wave_H,
            period_s: currentCalcConstants().incident_wave_T,
            direction_deg: currentCalcConstants().incident_wave_direction,
        };
    }

    function setTimeSeriesCount(args = {}) {
        const count = normalizeTimeSeriesCount(args.time_series_count, currentCalcConstants().NumberOfTimeSeries || 0);
        updateCalcConstants("NumberOfTimeSeries", count);
        currentCalcConstants().chartDataUpdate = 1;
        updateAllUIElements();
        return {
            namespace: "timeseries",
            action: "set_count",
            status: "applied",
            time_series_count: count,
            NumberOfTimeSeries: count,
        };
    }

    function setTimeSeriesDuration(args = {}) {
        const duration = Number(args.duration_s);
        if (!Number.isFinite(duration) || duration <= 0.0) {
            throw new Error(`Unsupported duration_s '${args.duration_s}'.`);
        }
        updateCalcConstants("maxdurationTimeSeries", duration);
        updateAllUIElements();
        return {
            namespace: "timeseries",
            action: "set_duration",
            status: "applied",
            duration_s: duration,
            maxdurationTimeSeries: duration,
        };
    }

    function selectTimeSeriesLocation(args = {}) {
        const index = normalizeTimeSeriesIndex(args.location_index, currentCalcConstants().changethisTimeSeries || 1);
        ensureTimeSeriesCountAtLeast(index);
        updateCalcConstants("changethisTimeSeries", index);
        updateAllUIElements();
        return {
            namespace: "timeseries",
            action: "select_location_index",
            status: "applied",
            location_index: index,
        };
    }

    function setTimeSeriesLocationXY(args = {}) {
        const index = normalizeTimeSeriesIndex(args.location_index, currentCalcConstants().changethisTimeSeries || 1);
        const x = Number(args.x_m);
        const y = Number(args.y_m);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("Time series location requires finite x_m and y_m coordinates.");
        }
        const constants = currentCalcConstants();
        ensureTimeSeriesCountAtLeast(index);
        updateCalcConstants("changethisTimeSeries", index);
        if (!constants.locationOfTimeSeries[index]) {
            constants.locationOfTimeSeries[index] = {};
        }
        constants.locationOfTimeSeries[index].xts = x;
        constants.locationOfTimeSeries[index].yts = y;
        constants.changeXTimeSeries = x;
        constants.changeYTimeSeries = y;
        constants.updateTimeSeriesTx = 1;
        constants.chartDataUpdate = 1;
        updateAllUIElements();
        return {
            namespace: "timeseries",
            action: "set_location_xy",
            status: "applied",
            location_index: index,
            x_m: x,
            y_m: y,
        };
    }

    function prepareTimeSeriesClickLocation(args = {}) {
        const index = normalizeTimeSeriesIndex(args.location_index, currentCalcConstants().changethisTimeSeries || 1);
        enterTimeSeriesPanelMode();
        ensureTimeSeriesCountAtLeast(index);
        updateCalcConstants("changethisTimeSeries", index);
        currentCalcConstants().chartDataUpdate = 1;
        updateAllUIElements();
        return {
            namespace: "timeseries",
            action: "prepare_click_location",
            status: "applied",
            location_index: index,
            placement_mode: "right_click",
        };
    }

    function runExampleCommand(args = {}) {
        const key = String(args.example || "").trim().toLowerCase();
        const selected = EXAMPLES[key];
        if (!selected) {
            throw new Error(`Unsupported example '${args.example}'.`);
        }
        runExample(selected.value);
        return {
            namespace: "examples",
            action: "run_example",
            status: "applied",
            example: selected.label,
            run_example: selected.value,
        };
    }

    function setPause(args = {}) {
        return applyEnumCommand("simulation.set_pause", args);
    }

    function enterFullscreenCommand(args = {}) {
        const key = normalizeKey(args.fullscreen_state || "enter");
        const selected = FULLSCREEN_STATES[key];
        if (!selected) {
            throw new Error(`Unsupported fullscreen state '${args.fullscreen_state}'.`);
        }
        if (currentCalcConstants().full_screen !== 1) {
            const fullscreenButton = document.getElementById("fullscreen-button");
            if (!fullscreenButton) {
                throw new Error("CELERIS fullscreen button is not available.");
            }
            fullscreenButton.click();
        }
        return {
            namespace: "view",
            action: "enter_fullscreen",
            status: "applied",
            fullscreen_state: selected.label,
            full_screen: 1,
        };
    }

    function exitFullscreenCleanupCommand() {
        if (exitFullscreenCleanup) {
            exitFullscreenCleanup();
        } else {
            updateViewMode?.(1);
            updateAllUIElements();
        }
        return {
            namespace: "view",
            action: "exit_fullscreen_cleanup",
            status: "applied",
            full_screen: currentCalcConstants().full_screen,
            viewType: currentCalcConstants().viewType,
        };
    }

    function applyCommand(command = {}) {
        const id = commandId(command.namespace, command.action);
        if (id === "examples.run_example") {
            return runExampleCommand(command.args || {});
        }
        if (id === "simulation.set_pause") {
            return setPause(command.args || {});
        }
        if (id === "view.enter_fullscreen") {
            return enterFullscreenCommand(command.args || {});
        }
        if (id === "view.exit_fullscreen_cleanup") {
            return exitFullscreenCleanupCommand();
        }
        if (id === "design.set_surface_component") {
            return setSurfaceComponent(command.args || {});
        }
        if (id === "design.prepare_linear_structure") {
            return prepareLinearStructure(command.args || {});
        }
        if (id === "design.confirm_linear_start") {
            return confirmLinearStart();
        }
        if (id === "design.confirm_linear_end_and_add") {
            return confirmLinearEndAndAdd();
        }
        if (id === "mods.activate_click_edit") {
            return activateModsClickEdit(command.args || {});
        }
        if (id === "boundary.set_boundary_type") {
            return setBoundaryType(command.args || {});
        }
        if (id === "boundary.set_incident_wave_parameters") {
            return setIncidentWaveParameters(command.args || {});
        }
        if (id === "timeseries.set_count") {
            return setTimeSeriesCount(command.args || {});
        }
        if (id === "timeseries.set_duration") {
            return setTimeSeriesDuration(command.args || {});
        }
        if (id === "timeseries.select_location_index") {
            return selectTimeSeriesLocation(command.args || {});
        }
        if (id === "timeseries.set_location_xy") {
            return setTimeSeriesLocationXY(command.args || {});
        }
        if (id === "timeseries.prepare_click_location") {
            return prepareTimeSeriesClickLocation(command.args || {});
        }
        if (ENUM_COMMANDS[id]) {
            return applyEnumCommand(id, command.args || {});
        }
        if (NUMERIC_COMMANDS[id]) {
            return applyNumericCommand(id, command.args || {});
        }
        throw new Error(`Unsupported CELERIS agent command '${id}'.`);
    }

    function applyCommands(commands = []) {
        const results = commands.map((command) => applyCommand(command));
        postStatus?.("celeris:runtime-command-applied", { results });
        return results;
    }

    function serializeTimeSeriesLocations(constants) {
        const count = normalizeTimeSeriesCount(constants.NumberOfTimeSeries, 0);
        const locations = [];
        for (let index = 1; index <= count; index += 1) {
            const location = constants.locationOfTimeSeries?.[index] || {};
            locations.push({
                index,
                x_m: Number.isFinite(Number(location.xts)) ? Number(location.xts) : null,
                y_m: Number.isFinite(Number(location.yts)) ? Number(location.yts) : null,
            });
        }
        return locations;
    }

    function serializeTimeSeriesPlot(constants) {
        const count = normalizeTimeSeriesCount(constants.NumberOfTimeSeries, 0);
        if (count <= 0 || !Array.isArray(timeSeriesData) || !timeSeriesData.length) {
            return { count, maxduration_s: constants.maxdurationTimeSeries, time: [], series: [] };
        }
        const time = Array.isArray(timeSeriesData[0]?.time) ? timeSeriesData[0].time : [];
        const series = [];
        for (let index = 0; index < count; index += 1) {
            const locationData = timeSeriesData[index] || {};
            series.push({
                index: index + 1,
                eta: Array.isArray(locationData.eta) ? locationData.eta : [],
            });
        }
        return {
            count,
            maxduration_s: constants.maxdurationTimeSeries,
            time,
            series,
        };
    }

    window.CelerisAgentControls = {
        applyCommand,
        applyCommands,
        getState() {
            const constants = currentCalcConstants();
            return {
                colorMap_choice: constants.colorMap_choice,
                colorVal_max: constants.colorVal_max,
                colorVal_min: constants.colorVal_min,
                full_screen: constants.full_screen,
                GoogleMapOverlay: constants.GoogleMapOverlay,
                ShowArrows: constants.ShowArrows,
                ShowLogos: constants.ShowLogos,
                arrow_scale: constants.arrow_scale,
                arrow_density: constants.arrow_density,
                run_example: constants.run_example,
                showBreaking: constants.showBreaking,
                simPause: constants.simPause,
                west_boundary_type: constants.west_boundary_type,
                east_boundary_type: constants.east_boundary_type,
                south_boundary_type: constants.south_boundary_type,
                north_boundary_type: constants.north_boundary_type,
                incident_wave_type: constants.incident_wave_type,
                incident_wave_H: constants.incident_wave_H,
                incident_wave_T: constants.incident_wave_T,
                incident_wave_direction: constants.incident_wave_direction,
                useSedTransModel: constants.useSedTransModel,
                sedC1_d50: constants.sedC1_d50,
                sedC1_n: constants.sedC1_n,
                sedC1_denrat: constants.sedC1_denrat,
                sedC1_psi: constants.sedC1_psi,
                sedC1_criticalshields: constants.sedC1_criticalshields,
                NumberOfTimeSeries: constants.NumberOfTimeSeries,
                maxdurationTimeSeries: constants.maxdurationTimeSeries,
                changethisTimeSeries: constants.changethisTimeSeries,
                timeSeriesLocations: serializeTimeSeriesLocations(constants),
                timeSeriesPlot: serializeTimeSeriesPlot(constants),
                simulation_time_seconds: constants.agent_total_time,
                simulation_time_minutes: Number.isFinite(constants.agent_total_time) ? constants.agent_total_time / 60.0 : null,
                simulation_time_since_update_seconds: constants.agent_total_time_since_http_update,
                faster_than_realtime_ratio: constants.agent_faster_than_realtime_ratio,
                elapsed_time_update_seconds: constants.elapsedTime_update,
                surfaceToPlot: constants.surfaceToPlot,
                viewType: constants.viewType,
                whichPanelisOpen: constants.whichPanelisOpen,
                designcomponentToAdd: constants.designcomponentToAdd,
                designcomponent_Radius: constants.designcomponent_Radius,
                designcomponent_CrestElev: constants.designcomponent_CrestElev,
                designcomponent_CrestWidth: constants.designcomponent_CrestWidth,
                designcomponent_SideSlope: constants.designcomponent_SideSlope,
                designcomponent_CurrentEndPoint: constants.designcomponent_CurrentEndPoint,
                designcomponent_StartDefined: constants.designcomponent_StartDefined,
                designcomponent_EndDefined: constants.designcomponent_EndDefined,
                surfaceToChange: constants.surfaceToChange,
                changeType: constants.changeType,
                changeAmplitude: constants.changeAmplitude,
                changeRadius: constants.changeRadius,
            };
        },
        validCommands: {
            "examples.run_example": Object.values(EXAMPLES).map((item) => item.label),
            "simulation.set_pause": validLabels(PAUSE_STATES),
            "boundary.set_boundary_type": {
                sides: validLabels(BOUNDARY_SIDES),
                boundary_types: validLabels(BOUNDARY_TYPES),
            },
            "boundary.set_incident_wave_type": validLabels(INCIDENT_WAVE_TYPES),
            "boundary.set_incident_wave_parameters": {
                height_m: "number",
                period_s: "number",
                direction_deg: "number",
            },
            "sediment.set_d50_mm": "number",
            "sediment.set_porosity": "number",
            "sediment.set_specific_gravity": "number",
            "sediment.set_erosion_psi": "number",
            "sediment.set_critical_shields": "number",
            "sediment.set_transport_model": validLabels(SEDIMENT_TRANSPORT_STATES),
            "timeseries.set_count": "integer 0-15",
            "timeseries.set_duration": "number of seconds",
            "timeseries.select_location_index": "integer 1-15",
            "timeseries.set_location_xy": ["location index, x_m, y_m"],
            "timeseries.prepare_click_location": ["location index"],
            "visualization.set_plot_quantity": validLabels(PLOT_QUANTITIES),
            "visualization.set_colormap": validLabels(COLORMAPS),
            "visualization.set_color_axis_max": "number",
            "visualization.set_color_axis_min": "number",
            "visualization.set_transport_overlay": validLabels(TRANSPORT_OVERLAYS),
            "visualization.set_map_overlay": validLabels(MAP_OVERLAYS),
            "visualization.set_vector_arrows": validLabels(VECTOR_ARROWS),
            "visualization.set_arrow_scale": "number",
            "visualization.set_arrow_density": "number",
            "visualization.set_logos": validLabels(LOGOS),
            "visualization.set_view_mode": validLabels(VIEW_MODES),
            "view.enter_fullscreen": validLabels(FULLSCREEN_STATES),
            "view.exit_fullscreen_cleanup": [],
            "design.set_surface_component": validLabels(DESIGN_COMPONENTS),
            "design.prepare_linear_structure": ["crest elevation, crest width, side slope"],
            "design.confirm_linear_start": [],
            "design.confirm_linear_end_and_add": [],
            "mods.activate_click_edit": validLabels(MOD_SURFACES),
        },
    };
    document.documentElement.dataset.celerisAgentControls = "ready";

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            window.parent?.postMessage({ type: "celeris-agent-keyboard-release" }, "*");
        }
    });

    window.addEventListener("message", (event) => {
        const data = event.data || {};
        if (data.type !== "celeris-agent-command") {
            if (data.type === "celeris-agent-state-request") {
                event.source?.postMessage({ type: "celeris-agent-state-result", id: data.id, ok: true, state: window.CelerisAgentControls.getState() }, event.origin || "*");
            }
            return;
        }
        try {
            const commands = Array.isArray(data.commands) ? data.commands : [data.command].filter(Boolean);
            const results = applyCommands(commands);
            event.source?.postMessage({ type: "celeris-agent-command-result", id: data.id, ok: true, results }, event.origin || "*");
        } catch (error) {
            const message = error?.message || String(error);
            postStatus?.("celeris:runtime-command-error", { message });
            event.source?.postMessage({ type: "celeris-agent-command-result", id: data.id, ok: false, error: message }, event.origin || "*");
        }
    });
}
