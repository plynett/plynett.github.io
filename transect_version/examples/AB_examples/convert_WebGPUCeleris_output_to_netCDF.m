clear all

cd output
% Load basic parameters
dx = load('dx.txt');
dy = load('dy.txt');
nx_all = load('nx.txt');
ny = load('ny.txt');

x_all = [0:1:nx_all-1] * dx;
y = [0:1:ny-1]' * dy;

% Specify number of time steps to plot
time_files = ls('time_*');
nt = length(time_files);  % 

% load bathy/topo [m]
fid = fopen('bathytopo.bin', 'r');
bathytopo_all = fread(fid, [nx_all, ny], 'float32');
fclose(fid);

time = zeros(nt,1);

num_pts = nx_all*ny*nt;

max_size = 1.5e9; %2.1e9;
if num_pts > max_size
    disp('Stack greater than 16 GB, will create multiple netcdfs partitioned in x')
    num_partitions = ceil(num_pts/max_size);
else
    num_partitions=1;
end

for part=1:num_partitions
    ichunk_size = round(nx_all/num_partitions);
    is = 1 + (part-1)*ichunk_size;
    ie = part*ichunk_size;
    if part==num_partitions
        ie = nx_all;
    end

    nx = ie-is+1;

    part_info(part,:) = [part is ie nx ny nt];

    eta_stack = zeros(nx,ny,nt);

    x = x_all(is:ie);
    %u_stack = eta_stack;
    %v_stack = eta_stack;

    for n = 1:nt
        disp(['Loading datafiles, storing in netCDF: Partition ' num2str(part) ' of ' num2str(num_partitions) ', ' num2str(round(100*n/nt)) '%'])
        time_fname = ['time_' num2str(n) '.txt'];
        time(n) = load(time_fname);  % [sec]

        % free surface elevation [m]
        eta_fname = ['elev_' num2str(n) '.bin']; % Note: Changed from .txt to .bin
        fid = fopen(eta_fname, 'r');
        eta = fread(fid, [nx_all, ny], 'float32');
        eta = eta(is:ie,:);
        fclose(fid);

        % x direction flux [m^2/s]
        % P_fname = ['xflux_' num2str(n) '.bin']; % Note: Changed from .txt to .bin
        % fid = fopen(P_fname, 'r');
        % P = fread(fid, [nx, ny], 'float32');
        % fclose(fid);
        %
        % % y direction flux [m^2/s]
        % Q_fname = ['yflux_' num2str(n) '.bin']; % Note: Changed from .txt to .bin
        % fid = fopen(Q_fname, 'r');
        % Q = fread(fid, [nx, ny], 'float32');
        % fclose(fid);

        %     % turbulent eddy viscosity from breaking [m/s^2]
        %     nu_fname = ['turb_' num2str(n) '.bin']; % Note: Changed from .txt to .bin
        %     fid = fopen(nu_fname, 'r');
        %     nu = fread(fid, [nx, ny], 'float32');
        %     fclose(fid);

        bathytopo = bathytopo_all(is:ie,:);
        H = eta - bathytopo;  % total water depth
        % u = P ./ H;  % [m/s]
        % v = Q ./ H;  % [m/s]

        drynodes = find(H<=0.0);  % find dry nodes, may need to change 0.0 to some threshold (e.g. 0.1) to eliminate large velocitys in thin flows
        % H(drynodes) = NaN;
        %  eta(drynodes) = NaN;
        % u(drynodes) = NaN;
        % v(drynodes) = NaN;
        %     nu(drynodes) = NaN;

        eta_stack(:,:,n)=eta;
        % u_stack(:,:,n)=u;
        % v_stack(:,:,n)=v;


        % Plotting
        %  figure(1);
        %  clf
        %  plot(x, eta(:,1), x, bathytopo(:,1));  % note the transpose '  - the surface data is [nx,ny]
        %
        % % shading interp;
        %  %clim([-1 1])
        %  %colorbar;
        %  title(sprintf('Time = %f seconds', time(n)));
        % pause
    end

    % save x, y, time, bathytopo, eta_stack, u_stack, and v_stack to netcdf file
    % -------------------------------------------------------------------------
    % === Save to NetCDF ===

    cd ..

   % eval(['save Celeris_datastacks_' num2str(part) '.mat x y time bathytopo eta_stack -v7.3'])

    % 1) build filename from current folder name
    fname = ['Celeris_datastack_' num2str(part) '.nc'];
    if exist(fname,'file')==2
        delete(fname);
    end

    % 2) create coordinate variables
    nccreate(fname, 'x',    'Dimensions', {'x', nx},   'Datatype','double');
    nccreate(fname, 'y',    'Dimensions', {'y', ny},   'Datatype','double');
    nccreate(fname, 'time', 'Dimensions', {'time', nt},'Datatype','double');

    % 3) create 2D and 3D fields
    nccreate(fname, 'bathytopo', 'Dimensions', {'x',nx,'y',ny},           'Datatype','single');
    nccreate(fname, 'eta', 'Dimensions', {'x',nx,'y',ny,'time',nt}, 'Datatype','single');
    % nccreate(fname, 'u',   'Dimensions', {'x',nx,'y',ny,'time',nt}, 'Datatype','single');
    % nccreate(fname, 'v',   'Dimensions', {'x',nx,'y',ny,'time',nt}, 'Datatype','single');

    % 4) write coordinate data
    ncwrite(fname, 'x',    x);
    ncwrite(fname, 'y',    y);
    ncwrite(fname, 'time', time);

    % 5) write fields
    ncwrite(fname, 'bathytopo',  bathytopo);
    ncwrite(fname, 'eta',  eta_stack);
    % ncwrite(fname, 'u',    u_stack);
    % ncwrite(fname, 'v',    v_stack);

    % 6) (optional) add units/long_name attributes
    ncwriteatt(fname,'x',         'units','m');
    ncwriteatt(fname,'y',         'units','m');
    ncwriteatt(fname,'time',      'units','s');

    ncwriteatt(fname,'bathytopo','long_name','bathymetry/topography');
    ncwriteatt(fname,'bathytopo','units','m');
    ncwriteatt(fname,'eta','long_name','free-surface elevation');
    ncwriteatt(fname,'eta','units','m');
    % ncwriteatt(fname,'u',  'long_name','x-velocity');
    % ncwriteatt(fname,'u',  'units','m s^-1');
    % ncwriteatt(fname,'v',  'long_name','y-velocity');
    % ncwriteatt(fname,'v',  'units','m s^-1');
    
    cd output

end
cd ..

save partition_info.txt part_info -ascii
