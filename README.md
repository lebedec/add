Build image
```bash
docker build ./server -t add-server
```

Deploy
```
apt-get update
apt-get install git

sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install python3.12
sudo apt install python3-pip

git clone https://github.com/lebedec/add.git
cd add/server
pip3 install -r requirements.txt

uvicorn service.app:app --port 80 --host 0.0.0.0 &
```