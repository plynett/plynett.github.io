% Animate BP01 Celeris-WebGPU surface output as x-z transects.
%
% This reads the saved eta surfaces from output/elev_*.bin and plots the
% centerline free surface over the fixed bathymetry/topography.

clear all
close all
clf

% -------------------------------------------------------------------------
% File locations and grid information written by Celeris
% -------------------------------------------------------------------------

output_dir = fullfile(pwd,'output');

nx = readmatrix(fullfile(output_dir,'nx.txt'));
ny = readmatrix(fullfile(output_dir,'ny.txt'));
dx = readmatrix(fullfile(output_dir,'dx.txt'));
dy = readmatrix(fullfile(output_dir,'dy.txt'));

x = (0:nx-1)'*dx;
jmid = round(ny/2);

% For BP01, the NTHMP benchmark x/d coordinate is shifted relative to the
% Celeris grid_type=1 coordinate.  Celeris x=0 is benchmark x/d=-5.
d = 1.0;
g = 9.80665;
tau = sqrt(d/g);
benchmark_left_x_over_d = -5.0;
x_over_d = x/d + benchmark_left_x_over_d;

% -------------------------------------------------------------------------
% Load bathymetry and list the saved eta frames
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);
bathy_line = bathy(:,jmid);

elev_files = dir(fullfile(output_dir,'elev_*.bin'));
frame_number = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
end
[frame_number,sort_index] = sort(frame_number);
elev_files = elev_files(sort_index);

% -------------------------------------------------------------------------
% Animate the saved free-surface transects
% -------------------------------------------------------------------------

figure(1)
set(gcf,'Color','w')

for k = 1:length(elev_files)
    model_time = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));

    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);
    eta_line = eta(:,jmid);

    clf
    plot(x_over_d,bathy_line,'k-','LineWidth',1.5)
    hold on
    plot(x_over_d,eta_line,'b-','LineWidth',1.2)
    grid on
    xlim([-5 35])
    ylim([-1.1 0.3])
    xlabel('x / d')
    ylabel('z / d')
    title(sprintf('BP01 Celeris surface, frame %d, t/\\tau = %.2f', ...
        frame_number(k),model_time/tau))
    legend('Bathy/topo','Free surface','Location','southeast')
    drawnow
    pause(0.1)
end
