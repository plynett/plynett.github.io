function create_coulwave_inputs

load guidata.mat % loads H crest_H per lead file_loc mannings_n dx

save surge.dat surge -ascii

%bathy x,z pairs. Use as many as needed
bathy=load(file_loc);
bathy_orig=bathy;

% in case first x location is not zero, store it
bathy_x_shift=bathy(1,1);
save bathy_x_shift.txt bathy_x_shift -ascii

% shift bathy for internal source and sponge layer, add 400m for this
bathy(:,1)=bathy(:,1)-bathy(1,1)+400;
[mb,nb]=size(bathy);
bathy=[0 -wave_depth; 200 -wave_depth; bathy];

% shift for surge
bathy(:,2)=bathy(:,2)-surge;
offshore_combine_depth=-bathy(1,2);

save h_offshore.dat offshore_combine_depth -ascii
% shouldnt need to edit under this

figure(1)
subplot(2,1,1)
plot(bathy(:,1),bathy(:,2))
xlabel('Distance (m)')
ylabel('Ground Elevation w.r.t. Still Water Surge (m)')
title('Input Bathymetry')

% save bathy in COULWAVE format
tmp=bathy(:,1);
save x_topo.dat tmp -ascii
tmp=bathy(:,2);
save f_topo.dat tmp -ascii
tmp=[length(bathy(:,1)); 1];
save size_topo.dat tmp -ascii

save dx.dat dx -ascii
save mannings.dat mannings_n -ascii

% will write 400 time series to file, spread them out evenly
count=0;
% d_ts=( bathy(length(bathy(:,1)),1) - 200)/400;
% x_ts=[200:d_ts:bathy(length(bathy(:,1)),1)];
x_ts = [620:0.25:680];
for j=1:length(x_ts)
    count=count+1;
    ts_loc(count,:)=[x_ts(j) 0];
end

save ts_locations.dat ts_loc -ascii
save num_ts.dat count -ascii

% create input spectrum file
spectrum_1D

% other parameters for the simulation are stored in the template
% sim_Set.dat in the modeldir.  These include:
% NO FLUX LIMITERS used in FV scheme - for better accuracy
% Total simulation time = 2100 seconds; first 15 minutes is "warmup"
% Courant number=0.15
% Min depth at shoreline / runup = 0.025 m
