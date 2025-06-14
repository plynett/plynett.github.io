
clear all
clf

% parameters
dx =1;


% create variables for ranges of inputs
depth = 5; % depth at wave generator
surge = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]; % additional water level 
Hs = [0, 0.5, 1, 1.5, 2]; % short-wave sig wave height
Tp = [6, 10, 12, 15, 20]; % peak wave period
HRMS = [0, 0.25, 0.5, 0.75, 1]; % H_RMS for IG wave
T_IG = [60, 96, 120, 240, 300]; % IG wave periods

% create combinations and remove unuseful scenarios
combos = combinations(depth,surge,Hs,Tp,HRMS,T_IG); 
combos(find(combos.HRMS==0 & combos.Hs==0),:)=[];
[num_combos,num_parameters] = size(combos);

% load transect bathy
load bathy.txt -ascii
z_bathy = bathy(:,1);
h_bathy = bathy(:,2);

% interp to dx
z_bathy = z_bathy-z_bathy(1);
x = [0:dx:z_bathy(end)];
B = interp1(z_bathy,h_bathy,x);

nx=length(x);

B_all=zeros(num_combos,nx);

for n=1:num_combos
    B_all(n,:) = B - B(1) - combos{n,1} - combos{n,2};  % set offshore elevation to -depth, and then add surge
end

figure(1)
clf
pcolor(x,1:num_combos,B_all)
shading interp
xlabel(' x(m) ')
ylabel('Combination Number')
title('Transect Elevation')


% create a frequency vector for all simulations to use
del_f=1/(30*60); % interval at which to calc discrete amplitude spectrum (Hz), should repeat in analysis time = 30 min
f_start=0.5/max(Tp);
f_end=  4.0/min(Tp);
f=[f_start:del_f:f_end];
nf=length(f) + 1; % plus one for the IG

amps_all=zeros(num_combos,nf);
periods_all = amps_all;
phases_all = amps_all;


for n=1:num_combos
    depth_c = combos{n,1} + combos{n,2};
    Hs_c = combos{n,3};
    Tp_c = combos{n,4};
    H_IG = combos{n,5};
    T_IG = combos{n,6};

    [amps,periods,phases] = spectrum_1D(f,depth_c,Hs_c,Tp_c,H_IG,T_IG);

    amps_all(n,:) = amps;
    periods_all(n,:) = periods;
    phases_all(n,:) = phases;
end


figure(2)
clf
pcolor(periods_all(1,2:end),1:num_combos,amps_all(:,2:end))
shading interp
xlabel(' Period (sec) ')
ylabel('Combination Number')
title('Amplitude')








