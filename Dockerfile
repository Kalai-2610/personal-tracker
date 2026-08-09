#Base image
FROM node:20 
#working directory of inside the container
WORKDIR /app
#Copy the package.json fom current directory
COPY package*.json ./
#Install the dependcies
RUN npm install
#copy the current directory
COPY . .
#Expose the port 3000
EXPOSE 3000
#Commands for the start the app
CMD ["npm","run", "prod"]