function generate_bp09_inputs_matlab(base_refinement, child_refinement, nested_dt, nested_eta_threshold, sim_duration)
%GENERATE_BP09_INPUTS_MATLAB Create BP09 Celeris nested-grid inputs.
% This follows the Pearl Harbor master_nested_config.m workflow: define a
% master grid hierarchy, interpolate source bathy/topo onto each grid, write
% config.json/bathy.txt/waves.txt, and use etaInitCond.txt on the first grid only.

if nargin < 1 || isempty(base_refinement), base_refinement = 4; end
if nargin < 2 || isempty(child_refinement), child_refinement = 4; end
if nargin < 3 || isempty(nested_dt), nested_dt = 10.0; end
if nargin < 4 || isempty(nested_eta_threshold), nested_eta_threshold = 0.01; end
if nargin < 5 || isempty(sim_duration), sim_duration = 1800.0; end
if base_refinement < 3 || base_refinement > 5
    error('base_refinement must be between 3 and 5 for the BP09 nested-grid ladder.');
end
if child_refinement < 3 || child_refinement > 5
    error('child_refinement must be between 3 and 5 for the BP09 nested-grid ladder.');
end

script_dir = fileparts(mfilename('fullpath'));
nthmp_dir = fileparts(script_dir);
reference_dir = fullfile(nthmp_dir, 'reference_data', 'BP09');
output_root = fullfile(nthmp_dir, 'runs', 'BP09');
if ~exist(output_root, 'dir'), mkdir(output_root); end

region_a.lon_min = 138.5;
region_a.lat_min = 40.0 + 31.0 / 60.0;
region_a.lon_max = 140.0 + 33.0 / 60.0;
region_a.lat_max = 43.0 + 18.0 / 60.0;
region_a.width = 379;
region_a.height = 687;
dlon_a = (region_a.lon_max - region_a.lon_min) / (region_a.width - 1);
dlat_a = (region_a.lat_max - region_a.lat_min) / (region_a.height - 1);

grids = bp09_master_grids(child_refinement);
sources = bp09_sources(region_a);
source_cache = struct();

fprintf('Generating BP09 Celeris inputs with base_refinement=%d, child_refinement=%d\n', base_refinement, child_refinement);

resolved = cell(1, numel(grids));
for grid_idx = 1:numel(grids)
    resolved{grid_idx} = resolve_grid(grids, grid_idx, sources, source_cache, reference_dir, dlon_a, dlat_a, base_refinement);
    source_cache = resolved{grid_idx}.source_cache;
end

for grid_idx = 1:numel(grids)
    grid = resolved{grid_idx};
    [bottom, source_cache, bathy_coverage] = interpolate_from_sources(grid.source_priority, sources, source_cache, reference_dir, grid.x, grid.y, []);
    eta = [];
    eta_coverage = struct([]);
    if isfield(grid, 'initial_condition_source') && ~isempty(grid.initial_condition_source)
        [eta, source_cache, eta_coverage] = interpolate_from_sources({grid.initial_condition_source}, sources, source_cache, reference_dir, grid.x, grid.y, 0.0);
    end

    rectangles = nested_rectangles(grids, resolved, grid_idx, nested_dt, nested_eta_threshold, sim_duration);
    gauges = selected_gauges(grid);
    config = build_config(grid, bottom, gauges, rectangles, nested_dt, nested_eta_threshold, sim_duration);
    manifest = build_manifest(grid, config, gauges, rectangles, bathy_coverage, eta_coverage, eta, bottom);

    out_dir = fullfile(output_root, grid.variant);
    if ~exist(out_dir, 'dir'), mkdir(out_dir); end
    write_json(fullfile(out_dir, 'config.json'), config);
    write_json(fullfile(out_dir, 'case_manifest.json'), manifest);
    write_grid_txt(fullfile(out_dir, 'bathy.txt'), bottom);
    write_waves_file(fullfile(out_dir, 'waves.txt'));
    eta_path = fullfile(out_dir, 'etaInitCond.txt');
    if isempty(eta)
        if exist(eta_path, 'file'), delete(eta_path); end
    else
        write_grid_txt(eta_path, eta);
    end

    spacing = approximate_spacing_m(grid);
    fprintf('Generated BP09 %s at %s (%dx%d, approx %.2f m)\n', grid.variant, out_dir, grid.width, grid.height, spacing.mean_m);
    for rect_idx = 1:numel(rectangles)
        fprintf('  nested boundary output prefix: %s\n', rectangles(rect_idx).file_prefix);
    end
end
end

function grids = bp09_master_grids(child_refinement)
grids = make_grid('grid_a', 'gridA_okushiri', 'A', '', '', {'grid_b'}, ...
    bounds_struct(138.5, 40.0 + 31.0 / 60.0, 140.0 + 33.0 / 60.0, 43.0 + 18.0 / 60.0), '', 1, ...
    {'pmel_a'}, 'hno1993', {'iwanai', 'esashi', 'aonae'}, empty_pmel_link());
grids(end + 1) = make_grid('grid_b', 'gridB_south_okushiri', 'B', 'grid_a', 'gridB', {'grid_c_aonae', 'grid_c_monai'}, ...
    bounds_struct(139.0 + 23.22 / 60.0, 42.0 + 0.16 / 60.0, 139.0 + 40.0 / 60.0, 42.0 + 10.0 / 60.0), '', child_refinement, ...
    {'ok03', 'pmel_b1', 'pmel_a'}, '', {'aonae', 'aonae_lighthouse', 'monai_camping', 'monai_river'}, pmel_link('grid_a', 165, 365));
grids(end + 1) = make_grid('grid_c_aonae', 'gridC_aonae', 'C_Aonae', 'grid_b', 'gridC_aonae', {}, ...
    bounds_struct(139.425, 42.025, 139.505, 42.085), '', child_refinement, ...
    {'ao15', 'ok03', 'pmel_c1', 'pmel_b1', 'pmel_a'}, '', {'aonae', 'aonae_lighthouse'}, pmel_link('grid_b', 27, 30));
grids(end + 1) = make_grid('grid_c_monai', 'gridC_monai', 'C_Monai', 'grid_b', 'gridC_monai', {}, ...
    bounds_struct(139.0 + 24.5 / 60.0, 42.0 + 4.0 / 60.0, 139.0 + 26.0 / 60.0, 42.0 + 9.5 / 60.0), '', child_refinement, ...
    {'mb05', 'mo01', 'ok03', 'pmel_c23', 'pmel_b1', 'pmel_a'}, '', {'monai_camping', 'monai_river'}, pmel_link('grid_b', 14, 49));
end

function grid = make_grid(key, variant, label, parent, prefix, children, bounds, bounds_source, refinement, source_priority, initial_condition_source, gauges, link)
grid.key = key;
grid.variant = variant;
grid.label = label;
grid.parent = parent;
grid.boundary_prefix = prefix;
grid.children = children;
grid.bounds = bounds;
grid.bounds_source = bounds_source;
grid.refinement = refinement;
grid.source_priority = source_priority;
grid.initial_condition_source = initial_condition_source;
grid.gauges = gauges;
grid.pmel_link = link;
end

function b = bounds_struct(lon_min, lat_min, lon_max, lat_max)
b.lon_min = lon_min;
b.lat_min = lat_min;
b.lon_max = lon_max;
b.lat_max = lat_max;
end

function link = pmel_link(parent, i, j)
link.parent = parent;
link.i = i;
link.j = j;
link.base = '1-based west-south';
end

function link = empty_pmel_link()
link = pmel_link('', NaN, NaN);
end

function sources = bp09_sources(region_a)
sources.pmel_a = pmel_source('PMEL/BATHYMETRY/D379-687-450m.txt', region_a.width, region_a.height, region_a.lon_min, region_a.lat_min, region_a.lon_max, region_a.lat_max);
sources.pmel_b1 = pmel_source('PMEL/BATHYMETRY/D154-124-150m.txt', 154, 124, 139.0 + 23.22 / 60.0, 42.0 + 0.16 / 60.0, 139.0 + 40.0 / 60.0, 42.0 + 10.0 / 60.0);
sources.pmel_c1 = pmel_source('PMEL/BATHYMETRY/D112-94-50m.txt', 112, 94, 139.0 + 26.0 / 60.0, 42.0 + 2.5 / 60.0, 139.0 + 30.0 / 60.0, 42.0 + 5.0 / 60.0);
sources.pmel_c23 = pmel_source('PMEL/BATHYMETRY/D40-202-50m.txt', 40, 202, 139.0 + 24.5 / 60.0, 42.0 + 4.0 / 60.0, 139.0 + 26.0 / 60.0, 42.0 + 9.5 / 60.0);
sources.ok03 = xyz_source('BathyTopoSource/OK03.xyz');
sources.ao15 = xyz_source('BathyTopoSource/AO15.xyz');
sources.mo01 = xyz_source('BathyTopoSource/MO01.xyz');
sources.mb05 = xyz_source('BathyTopoSource/MB05.xyz');
sources.hno1993 = xyz_source('BathyTopoSource/HNO1993.xyz');
end

function s = pmel_source(path, width, height, lon_min, lat_min, lon_max, lat_max)
s.kind = 'pmel_bathy';
s.path = path;
s.width = width;
s.height = height;
s.lon_min = lon_min;
s.lat_min = lat_min;
s.lon_max = lon_max;
s.lat_max = lat_max;
end

function s = xyz_source(path)
s.kind = 'xyz';
s.path = path;
end

function [source, source_cache] = load_source(source_key, sources, source_cache, reference_dir)
if isfield(source_cache, source_key)
    source = source_cache.(source_key);
    return;
end
spec = sources.(source_key);
full_path = fullfile(reference_dir, spec.path);
switch spec.kind
    case 'xyz'
        data = readmatrix(full_path, 'FileType', 'text');
        x = unique(data(:, 1));
        y = unique(data(:, 2));
        values = nan(numel(y), numel(x));
        [~, ix] = ismember(data(:, 1), x);
        [~, iy] = ismember(data(:, 2), y);
        values(sub2ind(size(values), iy, ix)) = data(:, 3);
        if any(isnan(values), 'all')
            error('%s is not a complete rectilinear xyz grid.', full_path);
        end
        source.key = source_key;
        source.path = full_path;
        source.x = x(:)';
        source.y = y(:)';
        source.values = values;
    case 'pmel_bathy'
        depth_topo = read_pmel_grid(full_path, spec.width, spec.height);
        source.key = source_key;
        source.path = full_path;
        source.x = linspace(spec.lon_min, spec.lon_max, spec.width);
        source.y = linspace(spec.lat_min, spec.lat_max, spec.height);
        source.values = -depth_topo;
    otherwise
        error('Unsupported source kind %s.', spec.kind);
end
source_cache.(source_key) = source;
end

function values = read_pmel_grid(path, width, height)
tokens = sscanf(fileread(path), '%f');
expected = width * height;
if numel(tokens) ~= expected
    error('%s has %d values; expected %d.', path, numel(tokens), expected);
end
values = reshape(tokens, width, height)';
values = flipud(values);
end

function [values, source_cache, coverage] = interpolate_from_sources(source_keys, sources, source_cache, reference_dir, target_x, target_y, fill_value)
values = nan(numel(target_y), numel(target_x));
coverage = struct([]);
for k = 1:numel(source_keys)
    source_key = source_keys{k};
    [source, source_cache] = load_source(source_key, sources, source_cache, reference_dir);
    [xq, yq] = meshgrid(target_x, target_y);
    candidate = interp2(source.x, source.y, source.values, xq, yq, 'linear', NaN);
    fill = isnan(values) & isfinite(candidate);
    values(fill) = candidate(fill);
    coverage(end + 1).source = source_key; %#ok<AGROW>
    coverage(end).path = source.path;
    coverage(end).covered_cells = nnz(fill);
    coverage(end).available_cells = nnz(isfinite(candidate));
end
missing = isnan(values);
if any(missing, 'all')
    if ~isempty(fill_value)
        values(missing) = fill_value;
        coverage(end + 1).source = 'fill_value';
        coverage(end).path = '';
        coverage(end).covered_cells = nnz(missing);
        coverage(end).available_cells = nnz(missing);
        coverage(end).fill_value = fill_value;
    else
        error('Source priority left %d target cells uncovered.', nnz(missing));
    end
end
end

function grid = resolve_grid(grids, grid_idx, sources, source_cache, reference_dir, dlon_a, dlat_a, base_refinement)
grid = grids(grid_idx);
if ~isempty(grid.bounds_source)
    [source, source_cache] = load_source(grid.bounds_source, sources, source_cache, reference_dir);
    grid.bounds = bounds_struct(source.x(1), source.y(1), source.x(end), source.y(end));
end
grid.source_cache = source_cache;
cumulative = cumulative_refinement(grids, grid_idx);
grid.cumulative_refinement = cumulative;
grid.dx = dlon_a / base_refinement / cumulative;
grid.dy = dlat_a / base_refinement / cumulative;
grid.x = axis_from_bounds(grid.bounds.lon_min, grid.bounds.lon_max, grid.dx);
grid.y = axis_from_bounds(grid.bounds.lat_min, grid.bounds.lat_max, grid.dy);
grid.width = numel(grid.x);
grid.height = numel(grid.y);
grid.lon_ll = grid.x(1);
grid.lat_ll = grid.y(1);
grid.lon_ur = grid.x(end);
grid.lat_ur = grid.y(end);
grid.base_refinement = base_refinement;
end

function cumulative = cumulative_refinement(grids, grid_idx)
grid = grids(grid_idx);
if isempty(grid.parent)
    cumulative = grid.refinement;
    return;
end
parent_idx = find_grid_index(grids, grid.parent);
cumulative = grid.refinement * cumulative_refinement(grids, parent_idx);
end

function idx = find_grid_index(grids, key)
idx = find(strcmp({grids.key}, key), 1);
if isempty(idx)
    error('Grid %s not found.', key);
end
end

function axis_values = axis_from_bounds(start_value, end_value, spacing)
count = floor((end_value - start_value) / spacing + 1.0e-9) + 1;
axis_values = start_value + (0:(count - 1)) * spacing;
end

function rectangles = nested_rectangles(grids, resolved, grid_idx, nested_dt, nested_eta_threshold, sim_duration)
grid = resolved{grid_idx};
rectangles = struct([]);
for child_idx = 1:numel(grid.children)
    child_key = grid.children{child_idx};
    child = resolved{find_grid_index(grids, child_key)};
    i0 = round((child.bounds.lon_min - grid.lon_ll) / grid.dx);
    i1 = round((child.bounds.lon_max - grid.lon_ll) / grid.dx);
    j0 = round((child.bounds.lat_min - grid.lat_ll) / grid.dy);
    j1 = round((child.bounds.lat_max - grid.lat_ll) / grid.dy);
    i0 = max(0, min(grid.width - 1, i0));
    i1 = max(0, min(grid.width - 1, i1));
    j0 = max(0, min(grid.height - 1, j0));
    j1 = max(0, min(grid.height - 1, j1));
    rectangles(end + 1).enabled = 1; %#ok<AGROW>
    rectangles(end).name = child.variant;
    rectangles(end).file_prefix = child.boundary_prefix;
    rectangles(end).i0 = min(i0, i1);
    rectangles(end).j0 = min(j0, j1);
    rectangles(end).i1 = max(i0, i1);
    rectangles(end).j1 = max(j0, j1);
    rectangles(end).start_time = 0.0;
    rectangles(end).end_time = sim_duration;
    rectangles(end).dt = nested_dt;
    rectangles(end).max_samples = 8192;
    rectangles(end).eta_threshold = nested_eta_threshold;
    rectangles(end).target_grid = child.key;
    rectangles(end).target_variant = child.variant;
    rectangles(end).target_lon_min = child.bounds.lon_min;
    rectangles(end).target_lat_min = child.bounds.lat_min;
    rectangles(end).target_lon_max = child.bounds.lon_max;
    rectangles(end).target_lat_max = child.bounds.lat_max;
end
end

function config = build_config(grid, bottom, gauges, rectangles, nested_dt, nested_eta_threshold, sim_duration)
config = struct();
config.grid_type = 2;
config.WIDTH = grid.width;
config.HEIGHT = grid.height;
config.dx = grid.dx;
config.dy = grid.dy;
config.lat_LL = grid.lat_ll;
config.lon_LL = grid.lon_ll;
config.lat_UR = grid.lat_ur;
config.lon_UR = grid.lon_ur;
config.R_earth = 6371000.0;
config.Courant_num = 0.20;
config.timeScheme = 2;
config.NLSW_or_Bous = 0;
config.Accuracy_mode = 0;
config.g = 9.81;
config.seaLevel = 0.0;
config.base_depth = -min(bottom(:));
config.Theta = 2.0;
config.friction = 0.025;
config.isManning = 1;
config.algochanges = 1;
config.min_allowable_depth = 0.001;
config.infiltrationRate = 0.0;
config.useBreakingModel = 0;
config.Bcoef = 0.06666667;
config.tridiag_solve = 2;
config.loadetaIC = double(isempty(grid.parent));
config.add_Disturbance = -1;
is_parent = isempty(grid.parent);
config.west_boundary_type = ternary(is_parent, 1, 5);
config.east_boundary_type = ternary(is_parent, 1, 5);
config.south_boundary_type = ternary(is_parent, 1, 5);
config.north_boundary_type = ternary(is_parent, 1, 5);
config.BoundaryWidth = 12;
config.incident_wave_type = -1;
config.numberOfWaves = 1;
config.sim_duration = sim_duration;
config.surfaceToPlot = 0;
config.colorMap_choice = 2;
config.colorVal_min = -2.0;
config.colorVal_max = 2.0;
config.ShowLogos = 0;
config.GoogleMapOverlay = 0;
config.render_step = 8;
config.simPause = -1;
config.NumberOfTimeSeries = numel(gauges);
config.maxdurationTimeSeries = sim_duration;
config.locationOfTimeSeries = time_series_locations(grid, gauges);
config.trigger_writesurface = 1;
config.trigger_writesurface_start_time = 0.0;
config.trigger_writesurface_end_time = sim_duration;
config.dt_writesurface = 300.0;
config.write_eta = 1;
config.write_P = 0;
config.write_Q = 0;
config.write_u = 0;
config.write_v = 0;
config.write_turb = 0;
config.trigger_writeWaveHeight = 1;
config.trigger_resetMeans_time = 0.0;
config.trigger_resetWaveHeight_time = 0.0;
config.trigger_writeWaveHeight_time = sim_duration;
config.which_surface_to_write = 10;
config.nestedGridOutput_trigger = double(~isempty(rectangles));
if isempty(rectangles)
    config.nestedGridOutput_i0 = 0;
    config.nestedGridOutput_j0 = 0;
    config.nestedGridOutput_i1 = 0;
    config.nestedGridOutput_j1 = 0;
    config.nestedGridOutput_file_prefix = 'nested';
else
    config.nestedGridOutput_i0 = rectangles(1).i0;
    config.nestedGridOutput_j0 = rectangles(1).j0;
    config.nestedGridOutput_i1 = rectangles(1).i1;
    config.nestedGridOutput_j1 = rectangles(1).j1;
    config.nestedGridOutput_file_prefix = rectangles(1).file_prefix;
end
config.nestedGridOutput_start_time = 0.0;
config.nestedGridOutput_end_time = sim_duration;
config.nestedGridOutput_dt = nested_dt;
config.nestedGridOutput_max_samples = 8192;
config.nestedEtaWriteThreshold = nested_eta_threshold;
config.nestedGridOutput_rectangles = rectangles;
if ~isempty(grid.parent)
    names = boundary_file_names(grid.boundary_prefix);
    config.ts_west_file = names.ts_west_file;
    config.ts_east_file = names.ts_east_file;
    config.ts_south_file = names.ts_south_file;
    config.ts_north_file = names.ts_north_file;
end
end

function manifest = build_manifest(grid, config, gauges, rectangles, bathy_coverage, eta_coverage, eta, bottom)
spacing = approximate_spacing_m(grid);
manifest = struct();
manifest.benchmark = 'BP09';
manifest.variant = grid.variant;
manifest.grid_key = grid.key;
manifest.grid_label = grid.label;
manifest.status = 'generated';
manifest.setup_style = 'MATLAB Pearl Harbor master_nested_config.m style';
manifest.grid = struct('base_refinement', grid.base_refinement, 'grid_refinement', grid.refinement, ...
    'cumulative_refinement', grid.cumulative_refinement, 'width', grid.width, 'height', grid.height, ...
    'dx_degrees', grid.dx, 'dy_degrees', grid.dy, 'dx_m_approx', spacing.dx_m, 'dy_m_approx', spacing.dy_m, ...
    'spacing_m_approx', spacing.mean_m, 'lon_ll', grid.lon_ll, 'lat_ll', grid.lat_ll, ...
    'lon_ur', grid.lon_ur, 'lat_ur', grid.lat_ur, 'requested_bounds', grid.bounds, ...
    'base_depth_m', config.base_depth, 'bottom_min_m', min(bottom(:)), 'bottom_max_m', max(bottom(:)));
manifest.parent = grid.parent;
manifest.boundary_prefix = grid.boundary_prefix;
manifest.children = grid.children;
manifest.pmel_link = grid.pmel_link;
manifest.nested_output_rectangles = rectangles;
manifest.source_priority = grid.source_priority;
manifest.bathy_source_coverage = bathy_coverage;
manifest.initial_condition_source = grid.initial_condition_source;
manifest.initial_condition_coverage = eta_coverage;
manifest.gauges = gauges;
manifest.files = struct('config', 'config.json', 'bathy', 'bathy.txt', 'waves', 'waves.txt');
if ~isempty(eta)
    manifest.files.eta_initial_condition = 'etaInitCond.txt';
end
if ~isempty(grid.parent)
    names = boundary_file_names(grid.boundary_prefix);
    manifest.files.ts_west_file = names.ts_west_file;
    manifest.files.ts_east_file = names.ts_east_file;
    manifest.files.ts_south_file = names.ts_south_file;
    manifest.files.ts_north_file = names.ts_north_file;
end
end

function gauges = selected_gauges(grid)
all = bp09_gauges();
gauges = repmat(gauge_struct('', '', NaN, NaN), 0, 1);
for k = 1:numel(grid.gauges)
    gauge = all.(grid.gauges{k});
    if gauge.lon >= grid.lon_ll && gauge.lon <= grid.lon_ur && gauge.lat >= grid.lat_ll && gauge.lat <= grid.lat_ur
        gauge.xts = gauge.lon - grid.lon_ll;
        gauge.yts = gauge.lat - grid.lat_ll;
        gauges(end + 1) = gauge; %#ok<AGROW>
    end
end
end

function entries = time_series_locations(grid, gauges)
entries = repmat(struct('xts', 0.0, 'yts', 0.0), 1, 16);
for k = 1:numel(gauges)
    entries(k + 1).xts = gauges(k).lon - grid.lon_ll;
    entries(k + 1).yts = gauges(k).lat - grid.lat_ll;
end
end

function gauges = bp09_gauges()
gauges.aonae = gauge_struct('aonae', 'Aonae', 139.0 + 26.0 / 60.0 + 57.0 / 3600.0, 42.0 + 3.0 / 60.0 + 45.0 / 3600.0);
gauges.aonae_lighthouse = gauge_struct('aonae_lighthouse', 'Aonae lighthouse', 139.0 + 26.0 / 60.0 + 58.0 / 3600.0, 42.0 + 3.0 / 60.0 + 21.0 / 3600.0);
gauges.monai_camping = gauge_struct('monai_camping', 'Monai Camping Site', 139.0 + 25.0 / 60.0 + 11.0 / 3600.0, 42.0 + 6.0 / 60.0 + 44.0 / 3600.0);
gauges.monai_river = gauge_struct('monai_river', 'Monai River mouth', 139.0 + 25.0 / 60.0 + 25.0 / 3600.0, 42.0 + 6.0 / 60.0 + 29.0 / 3600.0);
gauges.iwanai = gauge_struct('iwanai', 'Iwanai', 140.50, 42.98);
gauges.esashi = gauge_struct('esashi', 'Esashi', 140.133333, 41.866667);
end

function gauge = gauge_struct(id, label, lon, lat)
gauge.id = id;
gauge.label = label;
gauge.lon = lon;
gauge.lat = lat;
gauge.xts = NaN;
gauge.yts = NaN;
end

function spacing = approximate_spacing_m(grid)
earth_radius = 6371000.0;
mean_lat_rad = deg2rad(0.5 * (grid.lat_ll + grid.lat_ur));
spacing.dx_m = earth_radius * max(abs(cos(mean_lat_rad)), 1.0e-8) * deg2rad(abs(grid.dx));
spacing.dy_m = earth_radius * deg2rad(abs(grid.dy));
spacing.mean_m = 0.5 * (spacing.dx_m + spacing.dy_m);
end

function names = boundary_file_names(prefix)
names.ts_west_file = [prefix '_time_series_bc_west.txt'];
names.ts_east_file = [prefix '_time_series_bc_east.txt'];
names.ts_south_file = [prefix '_time_series_bc_south.txt'];
names.ts_north_file = [prefix '_time_series_bc_north.txt'];
end

function write_json(path, value)
try
    text = jsonencode(value, PrettyPrint=true);
catch
    text = jsonencode(value);
end
fid = fopen(path, 'w');
if fid < 0, error('Could not open %s for writing.', path); end
fprintf(fid, '%s\n', text);
fclose(fid);
end

function write_grid_txt(path, values)
writematrix(values, path, 'Delimiter', ' ');
end

function write_waves_file(path)
fid = fopen(path, 'w');
if fid < 0, error('Could not open %s for writing.', path); end
fprintf(fid, '[NumberOfWaves] 1\n');
fprintf(fid, '=================================\n');
fprintf(fid, '0.0 10.0 0.0 0.0\n');
fclose(fid);
end

function value = ternary(condition, true_value, false_value)
if condition
    value = true_value;
else
    value = false_value;
end
end
